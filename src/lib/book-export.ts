import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import type { BookProject } from "@/lib/agent/types";

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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapePdfText(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
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

type PdfTextOp = {
  text: string;
  x: number;
  y: number;
  size: number;
};

type PdfPage = {
  ops: PdfTextOp[];
};

const PDF_PAGE_WIDTH = 419.52;
const PDF_PAGE_HEIGHT = 595.32;
const PDF_MARGIN_LEFT = 50.4;
const PDF_BODY_TOP = 533.7;
const PDF_BODY_BOTTOM = 78.3;
const PDF_LINE_HEIGHT = 20.7;
const PDF_FIRST_LINE_INDENT = 36;

function centeredText(text: string, size: number): number {
  // Times-Roman is proportional; this approximation is intentionally tuned for
  // title/chapter pages rather than exact typesetting metrics.
  return Math.max(36, (PDF_PAGE_WIDTH - text.length * size * 0.46) / 2);
}

function pdfTextOp({ text, x, y, size }: PdfTextOp): string {
  return `BT\n/F1 ${size} Tf\n${x.toFixed(1)} ${y.toFixed(1)} Td\n(${escapePdfText(text)}) Tj\nET`;
}

function pageNumberOp(index: number): PdfTextOp {
  return { text: String(index), x: PDF_MARGIN_LEFT, y: 556.8, size: 10 };
}

function titlePage(book: ExportBook, pageIndex: number): PdfPage {
  return {
    ops: [
      pageNumberOp(pageIndex),
      {
        text: book.title,
        x: centeredText(book.title, 36),
        y: 407.8,
        size: 36,
      },
      {
        text: book.author,
        x: centeredText(book.author, 28),
        y: 353.1,
        size: 28,
      },
    ],
  };
}

function blankPage(pageIndex: number): PdfPage {
  return { ops: [pageNumberOp(pageIndex)] };
}

function chapterTitlePage(chapter: ExportBook["chapters"][number], pageIndex: number): PdfPage {
  const title = chapter.title;
  return {
    ops: [
      pageNumberOp(pageIndex),
      {
        text: title,
        x: centeredText(title, 22),
        y: 313.9,
        size: 22,
      },
    ],
  };
}

function bodyPages(chapter: ExportBook["chapters"][number], firstPageIndex: number): PdfPage[] {
  const pages: PdfPage[] = [];
  let ops: PdfTextOp[] = [pageNumberOp(firstPageIndex)];
  let pageIndex = firstPageIndex;
  let y = PDF_BODY_TOP;

  const startNewPage = () => {
    pages.push({ ops });
    pageIndex += 1;
    ops = [pageNumberOp(pageIndex)];
    y = PDF_BODY_TOP;
  };

  const paragraphs = chapter.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const firstLineWidth = 52;
    const continuationWidth = 60;
    const firstPass = wrapText(paragraph, firstLineWidth);
    const lines =
      firstPass.length <= 1
        ? firstPass
        : [
            firstPass[0],
            ...wrapText(firstPass.slice(1).join(" "), continuationWidth),
          ];

    lines.forEach((line, lineIndex) => {
      if (y < PDF_BODY_BOTTOM) startNewPage();
      ops.push({
        text: line,
        x: lineIndex === 0 ? PDF_MARGIN_LEFT + PDF_FIRST_LINE_INDENT : PDF_MARGIN_LEFT,
        y,
        size: 12,
      });
      y -= PDF_LINE_HEIGHT;
    });
  }

  pages.push({ ops });
  return pages;
}

function buildPdf(book: ExportBook): Buffer {
  const pages: PdfPage[] = [titlePage(book, 0), blankPage(1)];
  for (const chapter of book.chapters) {
    pages.push(chapterTitlePage(chapter, pages.length));
    pages.push(...bodyPages(chapter, pages.length));
  }

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((page, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = page.ops.map(pdfTextOp).join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> >> >> /Contents ${contentObjectNumber} 0 R >>`,
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
    const paragraphs = file.chapter.content
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean)
      .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
      .join("\n      ");
    zip.file(
      `OEBPS/${file.href}`,
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>${escapeHtml(file.chapter.title)}</title>
    <style>body{font-family:serif;line-height:1.6;margin:2rem;} h1{font-size:1.6rem;}</style>
  </head>
  <body>
    <h1>${escapeHtml(file.chapter.title)}</h1>
    ${paragraphs}
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
  const base = safeFilename(book.title);
  if (format === "epub") {
    return {
      filename: `${base}.epub`,
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
    filename: `${base}.pdf`,
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
