import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import type { BookProject } from "@/lib/agent/types";
import {
  firstChapterDropCapParagraphIndex,
  paragraphIsRedundantChapterHeading,
  splitDropCapLeadingSpan,
} from "@/lib/reader-opening";

export type ExportFormat = "pdf" | "epub";

export interface ExportBook {
  title: string;
  author: string;
  synopsis: string;
  /** When set, a full-page image is inserted as page 2 in the PDF (after the title page). */
  coverImageUrl?: string;
  chapters: Array<{
    number: number;
    title: string;
    content: string;
  }>;
}

export interface ExportArtifact {
  filename: string;
  contentType: string;
  data: Buffer;
}

function safeFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "folio-book"
  );
}

/**
 * Human-readable filename: preserves case and spaces, removes only characters
 * that filesystems reject. Used for the user-facing download name so books
 * arrive as "The House at the End of Every Road.pdf".
 */
function displayFilename(input: string): string {
  const cleaned = input
    // Strip characters forbidden in Windows/macOS filenames
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.+$/, "")
    .slice(0, 120);
  return cleaned || "Folio Book";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapes parentheses for literal strings in PDF Tj ops; input should be ASCII-safe Unicode already normalized. */
function escapePdfText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

/** Truncate for running header; full escaping happens in renderDraw. */
function asciiHeadingClip(title: string, maxLen: number): string {
  const t = title.replace(/\s+/g, " ").trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, Math.max(0, maxLen - 3))}...`;
}

function wrapText(input: string, width: number): string[] {
  const words = input.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

/**
 * Approximate Times-Roman per-character advance in em units. Times has
 * highly variable advances — char-count wrapping under-fills by 15-20% on
 * lowercase-heavy fiction. These ratios come from the standard Type-1
 * Times-Roman AFM metrics, rounded into width buckets.
 */
function timesCharEm(ch: string): number {
  if (ch === " ") return 0.25;
  if ("ijlIft.,;:!|'`".includes(ch)) return 0.27;
  if ('\\/-()[]{}"*+'.includes(ch)) return 0.36;
  if ("abcdeghknopqrsuvxyz0123456789?".includes(ch)) return 0.5;
  if ("mw".includes(ch)) return 0.78;
  if ("MW".includes(ch)) return 0.92;
  if ("BCDEFGHKLNOPQRSTUVXYZ&$#@%".includes(ch)) return 0.66;
  if (/[A-Za-z]/.test(ch)) return 0.55;
  return 0.5;
}

function timesTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) w += timesCharEm(ch) * fontSize;
  return w;
}

/** Width-aware wrapper for body prose. Fills the line up to `maxWidthPts`. */
function wrapTextByWidth(
  input: string,
  maxWidthPts: number,
  fontSize: number
): string[] {
  const words = input.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (timesTextWidth(next, fontSize) > maxWidthPts && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function filterBodyParagraphs(
  raw: string[],
  chapterNumber: number,
  chapterTitle: string
): string[] {
  const stripped = raw
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !paragraphIsRedundantChapterHeading(p, chapterNumber, chapterTitle));
  return stripped.length ? stripped : raw.filter((p) => p.trim());
}

function approximateTextWidth(chars: number, fontSize: number): number {
  return chars * fontSize * 0.48;
}

function boldUcWidth(line: string, fontSize: number): number {
  return line.length * fontSize * BOLD_UC_RATIO;
}

function layoutTitleBlocks(title: string): { lines: string[]; fontSize: number } {
  const trimmed = title.replace(/\s+/g, " ").trim() || "Untitled";
  // Constrain title block tighter than page margins so it never crowds the trim.
  const usable = PDF_PAGE_WIDTH - PDF_MARGIN * 2 - 8;
  for (const fontSize of [26, 22, 19, 17, 15, 13]) {
    const maxChars = Math.max(10, Math.floor(usable / (fontSize * BOLD_UC_RATIO)));
    const lines = wrapText(trimmed.toUpperCase(), maxChars);
    const fits = lines.every((line) => boldUcWidth(line, fontSize) <= usable);
    if (fits && lines.length <= 4) return { lines, fontSize };
  }
  // Last-ditch fallback: aggressive shrink.
  const fontSize = 12;
  const maxChars = Math.max(8, Math.floor(usable / (fontSize * BOLD_UC_RATIO)));
  return { lines: wrapText(trimmed.toUpperCase(), maxChars), fontSize };
}

function centeredXBoldUc(line: string, fontSize: number): number {
  const w = boldUcWidth(line, fontSize);
  return Math.max(PDF_MARGIN, (PDF_PAGE_WIDTH - w) / 2);
}

function projectToExportBook(project: BookProject): ExportBook {
  const title = project.title || project.bible?.title || "Untitled Folio Book";
  const chapterMap = new Map<number, { title: string; parts: string[] }>();
  for (const batch of project.batches) {
    const chapterNumber = batch.chapterNumber ?? batch.batchNumber;
    const existing = chapterMap.get(chapterNumber) ?? {
      title: batch.chapterTitle || `Chapter ${chapterNumber}`,
      parts: [],
    };
    existing.parts.push(batch.prose);
    chapterMap.set(chapterNumber, existing);
  }

  const chapters =
    Array.from(chapterMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([number, chapter]) => ({
        number,
        title: chapter.title,
        content: chapter.parts.join("\n\n"),
      })) || [];

  return {
    title,
    author: "Folio",
    synopsis: project.synopsis || project.bible?.synopsis || "",
    coverImageUrl: project.cover?.imageUrl,
    chapters,
  };
}

async function loadCoverImageBytes(
  coverImageUrl: string
): Promise<Uint8Array | null> {
  const trimmed = coverImageUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    const filePath = path.join(process.cwd(), "public", trimmed.replace(/^\//, ""));
    try {
      const buf = await readFile(filePath);
      return new Uint8Array(buf);
    } catch {
      return null;
    }
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname.endsWith(".public.blob.vercel-storage.com")) return null;

  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function buildOnePageImagePdf(imageBytes: Uint8Array): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT]);
  const isPng =
    imageBytes.length >= 8 &&
    imageBytes[0] === 0x89 &&
    imageBytes[1] === 0x50 &&
    imageBytes[2] === 0x4e &&
    imageBytes[3] === 0x47;
  const image = isPng
    ? await doc.embedPng(imageBytes)
    : await doc.embedJpg(imageBytes);
  const margin = 28;
  const maxW = PDF_PAGE_WIDTH - margin * 2;
  const maxH = PDF_PAGE_HEIGHT - margin * 2;
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const x = (PDF_PAGE_WIDTH - drawW) / 2;
  const y = (PDF_PAGE_HEIGHT - drawH) / 2;
  page.drawImage(image, { x, y, width: drawW, height: drawH });
  const pdf = await doc.save();
  return Buffer.from(pdf);
}

/** Inserts a one-page image PDF so it becomes the second page of the manuscript (index 1). */
async function insertCoverAfterTitlePage(
  manuscript: Buffer,
  coverOnePagePdf: Buffer
): Promise<Buffer> {
  const out = await PDFDocument.create();
  const ms = await PDFDocument.load(manuscript);
  const cov = await PDFDocument.load(coverOnePagePdf);
  const msCount = ms.getPageCount();
  if (msCount < 1) return manuscript;
  const [p0] = await out.copyPages(ms, [0]);
  out.addPage(p0);
  const [c0] = await out.copyPages(cov, [0]);
  out.addPage(c0);
  if (msCount > 1) {
    const rest = await out.copyPages(
      ms,
      Array.from({ length: msCount - 1 }, (_, i) => i + 1)
    );
    rest.forEach((p) => out.addPage(p));
  }
  const saved = await out.save();
  return Buffer.from(saved);
}

// ─── Minimal vector PDF page model ─────────────────────────────────────────

type PdfFont = "F1" | "F2" | "F3";

type PdfDrawOp =
  | { kind: "text"; text: string; x: number; y: number; size: number; font: PdfFont }
  | {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      width: number;
      r: number;
      g: number;
      b: number;
    }
  | {
      kind: "ornament";
      cx: number;
      cy: number;
      r: number;
      g: number;
      b: number;
    };

type PdfPage = { draws: PdfDrawOp[]; isChapterOpener?: boolean };

// 6 × 9 inch trade paperback trim (industry standard for trade fiction).
const PDF_PAGE_WIDTH = 432;
const PDF_PAGE_HEIGHT = 648;
// Generous margins matched to a printed paperback (≈0.75" outside, 0.85" top/bottom).
const PDF_MARGIN = 54;
/** First prose baseline after on-page chapter header block (chapter opening pages). */
const FIRST_CHAPTER_BODY_TOP = 470;
/** First baseline on continuation spreads (below running header band) */
const CONTINUATION_BODY_TOP = 562;
const PDF_BODY_BOTTOM = 84;
const PDF_LINE_HEIGHT = 16.5;
/** Extra vertical slack after the ornamental opening row (kept tiny — cap doesn't descend below baseline) */
const DROP_CAP_ROW_LEAD = 0;
const PARA_GAP = PDF_LINE_HEIGHT * 0.18;
const PARA_INDENT = 24;
/** Times-Bold uppercase has wider average advance than the body 0.48 ratio. */
const BOLD_UC_RATIO = 0.62;

/** Subtle warm-charcoal accent for ornament rules — gentler than pure ember. */
const TITLE_ACCENT_LINE = [0.42, 0.30, 0.18] as const;

function bodyChars(lineWidthPts: number, fontSize: number): number {
  return Math.max(18, Math.floor(lineWidthPts / (fontSize * 0.48)));
}

function centeredX(line: string, fontSize: number): number {
  const w = approximateTextWidth(line.length, fontSize);
  return Math.max(PDF_MARGIN, (PDF_PAGE_WIDTH - w) / 2);
}

function pdfTextTmOp(
  fid: PdfFont,
  size: number,
  x: number,
  y: number,
  textRaw: string,
  fill?: readonly [number, number, number]
): string {
  const safe = escapePdfText(textRaw);
  const out: string[] = ["BT"];
  if (fill) {
    out.push(`${fill[0].toFixed(2)} ${fill[1].toFixed(2)} ${fill[2].toFixed(2)} rg`);
  }
  out.push(
    `/${fid} ${size.toFixed(2)} Tf`,
    `1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm`,
    `(${safe}) Tj`,
    "ET"
  );
  return out.join("\n");
}

function renderDraw(op: PdfDrawOp): string {
  if (op.kind === "line") {
    return [
      "q",
      `${op.width.toFixed(3)} w`,
      `${op.r.toFixed(2)} ${op.g.toFixed(2)} ${op.b.toFixed(2)} RG`,
      `${op.x1.toFixed(2)} ${op.y1.toFixed(2)} m`,
      `${op.x2.toFixed(2)} ${op.y2.toFixed(2)} l`,
      "S",
      "Q",
    ].join("\n");
  }
  if (op.kind === "ornament") {
    // A thin diamond-and-rule ornament (◆) drawn from filled triangles for portability.
    const half = 3.2;
    const ruleHalf = 36;
    const lines: string[] = [
      "q",
      `${op.r.toFixed(2)} ${op.g.toFixed(2)} ${op.b.toFixed(2)} RG`,
      `${op.r.toFixed(2)} ${op.g.toFixed(2)} ${op.b.toFixed(2)} rg`,
      "0.6 w",
      // left rule
      `${(op.cx - ruleHalf).toFixed(2)} ${op.cy.toFixed(2)} m`,
      `${(op.cx - half - 6).toFixed(2)} ${op.cy.toFixed(2)} l`,
      "S",
      // right rule
      `${(op.cx + half + 6).toFixed(2)} ${op.cy.toFixed(2)} m`,
      `${(op.cx + ruleHalf).toFixed(2)} ${op.cy.toFixed(2)} l`,
      "S",
      // diamond
      `${op.cx.toFixed(2)} ${(op.cy + half).toFixed(2)} m`,
      `${(op.cx + half).toFixed(2)} ${op.cy.toFixed(2)} l`,
      `${op.cx.toFixed(2)} ${(op.cy - half).toFixed(2)} l`,
      `${(op.cx - half).toFixed(2)} ${op.cy.toFixed(2)} l`,
      "h",
      "f",
      "Q",
    ];
    return lines.join("\n");
  }
  return pdfTextTmOp(op.font, op.size, op.x, op.y, op.text);
}

function footerDrawPrintPage(n: number): PdfDrawOp {
  const txt = String(n);
  const w = approximateTextWidth(txt.length, 10);
  const x = (PDF_PAGE_WIDTH - w) / 2;
  return { kind: "text", text: txt, x, y: 48, size: 10, font: "F1" };
}

/** Small-caps style header: book title on verso (even), chapter title on recto (odd). */
function runningHeaderDraws(
  bookTitle: string,
  chapterTitle: string,
  pageSeq: number
): PdfDrawOp[] {
  const isRecto = pageSeq % 2 === 1; // odd seq -> right-hand page
  const raw = isRecto ? chapterTitle : bookTitle;
  const clipped = asciiHeadingClip(raw, 60).toUpperCase();
  const size = 8.5;
  const w = approximateTextWidth(clipped.length, size);
  const cx = (PDF_PAGE_WIDTH - w) / 2;
  return [
    {
      kind: "text",
      text: clipped,
      x: cx,
      y: PDF_PAGE_HEIGHT - 44,
      size,
      font: "F1",
    },
  ];
}

function synopsisLines(syn: string): string[] {
  const one = syn.replace(/\s+/g, " ").trim();
  if (!one) return [];
  return wrapText(one, 70).slice(0, 3);
}

/** Title leaf: centered block, ornamental rules, author and synopsis — never numbered. */
function titlePage(book: ExportBook): PdfPage {
  const draws: PdfDrawOp[] = [];

  // Top thin rule with diamond — classic title-page motif
  draws.push({
    kind: "ornament",
    cx: PDF_PAGE_WIDTH / 2,
    cy: PDF_PAGE_HEIGHT - 152,
    r: TITLE_ACCENT_LINE[0],
    g: TITLE_ACCENT_LINE[1],
    b: TITLE_ACCENT_LINE[2],
  });

  const { lines, fontSize } = layoutTitleBlocks(book.title);
  const lineLead = fontSize * 1.36;
  const blockHalf = ((lines.length - 1) * lineLead) / 2 + fontSize / 3;
  let y = PDF_PAGE_HEIGHT * 0.58 + blockHalf;

  for (const line of lines) {
    draws.push({
      kind: "text",
      text: line,
      x: centeredXBoldUc(line, fontSize),
      y,
      size: fontSize,
      font: "F2",
    });
    y -= lineLead;
  }

  // Author line with leading "by"
  const authorLine = book.author.trim() || "Folio";
  y -= 50;
  const byLabel = "by";
  draws.push({
    kind: "text",
    text: byLabel,
    x: centeredX(byLabel, 11),
    y,
    size: 11,
    font: "F3",
  });
  y -= 22;
  draws.push({
    kind: "text",
    text: authorLine,
    x: centeredX(authorLine, 14),
    y,
    size: 14,
    font: "F1",
  });

  // Synopsis block, italic, narrow
  y -= 56;
  for (const ln of synopsisLines(book.synopsis)) {
    draws.push({
      kind: "text",
      text: ln,
      x: centeredX(ln, 10.5),
      y,
      size: 10.5,
      font: "F3",
    });
    y -= 14.5;
  }

  // Bottom diamond ornament
  draws.push({
    kind: "ornament",
    cx: PDF_PAGE_WIDTH / 2,
    cy: 110,
    r: TITLE_ACCENT_LINE[0],
    g: TITLE_ACCENT_LINE[1],
    b: TITLE_ACCENT_LINE[2],
  });

  return { draws };
}

/** Copyright / colophon page — small italic note centered low on the page. */
function colophonPage(book: ExportBook): PdfPage {
  const draws: PdfDrawOp[] = [];
  const year = new Date().getFullYear();
  const lines: Array<{ text: string; size: number; font: PdfFont }> = [
    { text: book.title, size: 12, font: "F2" },
    { text: `© ${year} ${book.author || "Folio"}`, size: 10, font: "F1" },
    { text: "All rights reserved.", size: 10, font: "F3" },
    { text: "Generated with Folio — folio.app", size: 9.5, font: "F3" },
  ];
  let y = 200;
  for (const ln of lines) {
    draws.push({
      kind: "text",
      text: ln.text,
      x: centeredX(ln.text, ln.size),
      y,
      size: ln.size,
      font: ln.font,
    });
    y -= ln.size * 1.6 + 4;
  }
  return { draws };
}

function blankPage(): PdfPage {
  return { draws: [] };
}

function mathChapterTitleFont(title: string): number {
  if (title.length > 72) return 14;
  if (title.length > 54) return 15;
  if (title.length > 44) return 16;
  return 17;
}

function wrapChapterTitleLines(title: string, fontSize: number): string[] {
  const usable = PDF_PAGE_WIDTH - PDF_MARGIN * 2 - 32;
  const maxChars = Math.max(14, Math.floor(usable / (fontSize * 0.5)));
  return wrapText(title.replace(/\s+/g, " ").trim(), maxChars);
}

function chapterOpenHeaderOps(chapter: ExportBook["chapters"][number]): PdfDrawOp[] {
  const draws: PdfDrawOp[] = [];
  // Roman numerals look more book-like for chapter labels
  const ROMAN = (n: number): string => {
    const map: Array<[number, string]> = [
      [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
      [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
      [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
    ];
    let r = "";
    let v = n;
    for (const [k, s] of map) {
      while (v >= k) { r += s; v -= k; }
    }
    return r || String(n);
  };
  const chapLabel = `CHAPTER ${ROMAN(chapter.number)}`;
  const labelSize = 10.25;
  const titleSize = mathChapterTitleFont(chapter.title);
  let chapY = 596;
  draws.push({
    kind: "text",
    text: chapLabel,
    x: centeredXBoldUc(chapLabel, labelSize),
    y: chapY,
    size: labelSize,
    font: "F2",
  });

  chapY -= 28;
  for (const line of wrapChapterTitleLines(chapter.title, titleSize)) {
    draws.push({
      kind: "text",
      text: line,
      x: centeredX(line, titleSize),
      y: chapY,
      size: titleSize,
      font: "F3",
    });
    chapY -= titleSize * 1.36 + 4;
  }

  // Ornamental diamond rule below chapter title
  draws.push({
    kind: "ornament",
    cx: PDF_PAGE_WIDTH / 2,
    cy: chapY + 2,
    r: TITLE_ACCENT_LINE[0],
    g: TITLE_ACCENT_LINE[1],
    b: TITLE_ACCENT_LINE[2],
  });
  return draws;
}

function measureDropCapFirstRowHeight(): number {
  return PDF_LINE_HEIGHT + DROP_CAP_ROW_LEAD;
}

function normalParagraphLineSpecs(
  paragraph: string,
  indentFirstLine: boolean,
  contentWidthPts: number
): Array<{ text: string; x: number }> {
  const bodySize = 12;
  const fullWidth = contentWidthPts;
  const firstLineWidth = indentFirstLine ? fullWidth - PARA_INDENT : fullWidth;
  const firstWrap = wrapTextByWidth(paragraph.trim(), firstLineWidth, bodySize);
  if (!firstWrap.length) return [];
  const out: Array<{ text: string; x: number }> = [];
  const firstIndentX = indentFirstLine ? PDF_MARGIN + PARA_INDENT : PDF_MARGIN;
  out.push({ text: firstWrap[0], x: firstIndentX });
  const rest = firstWrap.slice(1).join(" ").trim();
  if (rest) {
    for (const line of wrapTextByWidth(rest, fullWidth, bodySize)) {
      out.push({ text: line, x: PDF_MARGIN });
    }
  }
  return out;
}

type PageBuilder = {
  pages: PdfPage[];
  draws: PdfDrawOp[];
  seq: number;
  y: number;
  chapterTitle: string;
  bookTitle: string;
  isOpenerPage: boolean;
};

function flushPage(b: PageBuilder): void {
  if (!b.draws.length) return;
  b.draws.push(footerDrawPrintPage(b.seq));
  const isOpener = b.isOpenerPage;
  b.seq += 1;
  b.pages.push({ draws: b.draws, isChapterOpener: isOpener });
  b.draws = [];
  b.isOpenerPage = false;
}

function startContinuation(b: PageBuilder): void {
  for (const op of runningHeaderDraws(b.bookTitle, b.chapterTitle, b.seq)) {
    b.draws.push(op);
  }
  b.y = CONTINUATION_BODY_TOP;
}

function ensureBodySpace(b: PageBuilder, neededBelowBaseline: number): void {
  if (b.y - neededBelowBaseline >= PDF_BODY_BOTTOM) return;
  flushPage(b);
  startContinuation(b);
}

function emitNormalParagraph(
  b: PageBuilder,
  paragraph: string,
  indentFirstLine: boolean,
  contentWidthPts: number
): void {
  const bodySize = 12;
  const specs = normalParagraphLineSpecs(paragraph, indentFirstLine, contentWidthPts);
  for (const row of specs) {
    ensureBodySpace(b, PDF_LINE_HEIGHT);
    b.draws.push({
      kind: "text",
      text: row.text,
      x: row.x,
      y: b.y,
      size: bodySize,
      font: "F1",
    });
    b.y -= PDF_LINE_HEIGHT;
  }
  b.y -= PARA_GAP;
}

function emitDropCapParagraph(b: PageBuilder, paragraph: string, contentWidthPts: number): void {
  const part = splitDropCapLeadingSpan(paragraph);
  if (!part) {
    emitNormalParagraph(b, paragraph, false, contentWidthPts);
    return;
  }

  ensureBodySpace(b, measureDropCapFirstRowHeight());
  const yRow = b.y;
  const bodySize = 12;
  const dropSize = 34;
  let xCursor = PDF_MARGIN;
  const { prefix, letter, remainder } = part;

  if (prefix.trim()) {
    b.draws.push({
      kind: "text",
      text: prefix,
      x: xCursor,
      y: yRow,
      size: bodySize,
      font: "F1",
    });
    xCursor += approximateTextWidth([...prefix].length, bodySize);
  }

  b.draws.push({
    kind: "text",
    text: letter,
    x: xCursor,
    y: yRow + 5,
    size: dropSize,
    font: "F2",
  });

  const capAdvance = timesTextWidth(letter, dropSize) + 6;
  const textStart = xCursor + capAdvance;
  const firstLineWidth = PDF_PAGE_WIDTH - PDF_MARGIN - textStart;
  const textRest = remainder.trimStart();
  if (!textRest.length) {
    b.y = yRow - PDF_LINE_HEIGHT - DROP_CAP_ROW_LEAD;
    b.y -= PARA_GAP;
    return;
  }

  const firstWrapped = wrapTextByWidth(textRest, firstLineWidth, bodySize);
  const row0 = firstWrapped[0] ?? "";
  b.draws.push({
    kind: "text",
    text: row0,
    x: textStart,
    y: yRow,
    size: bodySize,
    font: "F1",
  });

  b.y = yRow - PDF_LINE_HEIGHT - DROP_CAP_ROW_LEAD;

  const tailCore = firstWrapped.slice(1).join(" ").trim();
  const tailLines = tailCore
    ? wrapTextByWidth(tailCore, contentWidthPts, bodySize)
    : [];

  for (const line of tailLines) {
    ensureBodySpace(b, PDF_LINE_HEIGHT);
    b.draws.push({
      kind: "text",
      text: line,
      x: PDF_MARGIN,
      y: b.y,
      size: bodySize,
      font: "F1",
    });
    b.y -= PDF_LINE_HEIGHT;
  }
  b.y -= PARA_GAP;
}

function composeChapterPages(
  chapter: ExportBook["chapters"][number],
  bookTitle: string,
  startSeq: number
): PdfPage[] {
  const rawParas = chapter.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const bodyParas = filterBodyParagraphs(rawParas, chapter.number, chapter.title);
  const dropIx = firstChapterDropCapParagraphIndex(
    bodyParas,
    true,
    chapter.number,
    chapter.title
  );

  const contentWidthPts = PDF_PAGE_WIDTH - PDF_MARGIN * 2;
  const b: PageBuilder = {
    pages: [],
    draws: [...chapterOpenHeaderOps(chapter)],
    seq: startSeq,
    y: FIRST_CHAPTER_BODY_TOP,
    chapterTitle: chapter.title,
    bookTitle,
    isOpenerPage: true,
  };

  let paraIndex = 0;
  for (const paragraph of bodyParas) {
    if (!paragraph.trim()) {
      paraIndex++;
      continue;
    }
    const indentThis = paraIndex > 0;
    const isDrop = paraIndex === dropIx && dropIx >= 0;
    if (isDrop) emitDropCapParagraph(b, paragraph, contentWidthPts);
    else emitNormalParagraph(b, paragraph, indentThis, contentWidthPts);
    paraIndex++;
  }

  flushPage(b);
  return b.pages;
}

function bodyPagesPdf(book: ExportBook): PdfPage[] {
  let seq = 1;
  const out: PdfPage[] = [];
  for (const ch of book.chapters) {
    const pages = composeChapterPages(ch, book.title, seq);
    out.push(...pages);
    seq += pages.length;
  }
  return out;
}

export function buildPdf(book: ExportBook): Buffer {
  const pages: PdfPage[] = [
    titlePage(book),
    colophonPage(book),
    blankPage(),
    ...bodyPagesPdf(book),
  ];
  const resources =
    "<< /Font << " +
    "/F1 << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> " +
    "/F2 << /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >> " +
    "/F3 << /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >> " +
    ">> >>";

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((page, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = page.draws.map(renderDraw).join("\n") || " ";
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources ${resources} /Contents ${contentObjectNumber} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`
    );
  });

  let output = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(output, "utf8"));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  output += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(output, "utf8");
}

async function buildEpub(book: ExportBook): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );

  const chapterFiles = book.chapters.map((chapter) => ({
    id: `chapter-${chapter.number}`,
    href: `chapter-${chapter.number}.xhtml`,
    chapter,
  }));

  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" unique-identifier="book-id" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">folio-${safeFilename(book.title)}</dc:identifier>
    <dc:title>${escapeHtml(book.title)}</dc:title>
    <dc:creator>${escapeHtml(book.author)}</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${chapterFiles.map((file) => `<item id="${file.id}" href="${file.href}" media-type="application/xhtml+xml"/>`).join("\n    ")}
  </manifest>
  <spine>
    ${chapterFiles.map((file) => `<itemref idref="${file.id}"/>`).join("\n    ")}
  </spine>
</package>`
  );

  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>${escapeHtml(book.title)}</title></head>
  <body>
    <nav epub:type="toc">
      <h1>${escapeHtml(book.title)}</h1>
      <ol>
        ${chapterFiles.map((file) => `<li><a href="${file.href}">${escapeHtml(file.chapter.title)}</a></li>`).join("\n        ")}
      </ol>
    </nav>
  </body>
</html>`
  );

  for (const file of chapterFiles) {
    const rawParagraphs = file.chapter.content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const paragraphs = filterBodyParagraphs(
      rawParagraphs,
      file.chapter.number,
      file.chapter.title
    );
    const dropIx = firstChapterDropCapParagraphIndex(
      paragraphs,
      true,
      file.chapter.number,
      file.chapter.title
    );
    const parasHtml = paragraphs
      .map((para, i) => {
        const isDrop = i === dropIx && dropIx >= 0;
        const classes = isDrop
          ? "paragraph opener drop-cap"
          : i > 0
            ? "paragraph indent"
            : "paragraph opener";
        return `<p class="${classes}">${escapeHtml(para)}</p>`;
      })
      .join("\n      ");

    zip.file(
      `OEBPS/${file.href}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeHtml(file.chapter.title)}</title>
    <style>
      body { font-family: Georgia, serif; line-height: 1.62; margin: 2rem; text-align: justify; hyphens: auto; }
      h1.chapt { font-size: 1.05rem; font-weight: bold; letter-spacing: 0.12em; text-transform: uppercase; text-align: center; margin: 3rem 0 0.5rem; border-bottom: none; }
      .chapt-title { font-size: 1.5rem; font-weight: bold; text-align: center; margin: 0 2rem 1.75rem; }
      hr.chapt-rule { width: 36%; margin: 0 auto 2.25rem; border: none; border-top: 0.06em solid #a67c52; }
      p.paragraph + p.paragraph { margin-top: 0.35rem; }
      p.opener { text-indent: 0; }
      p.indent { text-indent: 1.25em; }
      p.drop-cap::first-letter { float: left; font-weight: bold; font-size: 3.2em; line-height: 0.72; padding: 0.05em 0.1em 0 0; margin-top: 0.08em; }
    </style>
  </head>
  <body>
    <h1 class="chapt">Chapter ${file.chapter.number}</h1>
    <div class="chapt-title">${escapeHtml(file.chapter.title)}</div>
    <hr class="chapt-rule"/>
      ${parasHtml}
  </body>
</html>`
    );
  }

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function exportProjectBook(
  project: BookProject,
  format: ExportFormat
): Promise<ExportArtifact> {
  const book = projectToExportBook(project);
  return exportBook(book, format);
}

export async function exportBook(
  book: ExportBook,
  format: ExportFormat
): Promise<ExportArtifact> {
  const display = displayFilename(book.title);
  if (format === "epub") {
    return {
      filename: `${display}.epub`,
      contentType: "application/epub+zip",
      data: await buildEpub(book),
    };
  }

  let pdfData = buildPdf(book);
  if (book.coverImageUrl) {
    const imageBytes = await loadCoverImageBytes(book.coverImageUrl);
    if (imageBytes) {
      try {
        const coverPdf = await buildOnePageImagePdf(imageBytes);
        pdfData = await insertCoverAfterTitlePage(pdfData, coverPdf);
      } catch {
        // Fall back to manuscript without cover if image decode fails
      }
    }
  }
  return {
    filename: `${display}.pdf`,
    contentType: "application/pdf",
    data: pdfData,
  };
}

export function buildKindleEmail(
  artifact: ExportArtifact,
  kindleEmail: string,
  fromEmail: string
): ExportArtifact {
  const boundary = `folio-${Date.now().toString(36)}`;
  const subject = artifact.filename.toLowerCase().endsWith(".epub")
    ? "convert"
    : "Folio book export";
  const body = [
    `To: ${kindleEmail}`,
    `From: ${fromEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Attached is your Folio book export for Kindle delivery.",
    "",
    `--${boundary}`,
    `Content-Type: ${artifact.contentType}; name="${artifact.filename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${artifact.filename}"`,
    "",
    artifact.data.toString("base64").replace(/(.{76})/g, "$1\n"),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return {
    filename: `${artifact.filename.replace(/\.[^.]+$/, "")}-kindle-email.eml`,
    contentType: "message/rfc822",
    data: Buffer.from(body, "utf8"),
  };
}
