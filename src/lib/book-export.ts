import JSZip from "jszip";
import type { BookProject } from "@/lib/agent/types";

export type ExportFormat = "pdf" | "epub";

interface ExportBook {
  title: string;
  author: string;
  synopsis: string;
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
    chapters,
  };
}

function makePdfPage(lines: string[]): string {
  const escaped = lines.map((line) => `(${escapePdfText(line)}) Tj`).join("\n0 -17 Td\n");
  return `BT
/F1 11 Tf
72 742 Td
14 TL
${escaped}
ET`;
}

function buildPdf(book: ExportBook): Buffer {
  const allLines: string[] = [
    book.title,
    `by ${book.author}`,
    "",
    book.synopsis,
    "",
    ...book.chapters.flatMap((chapter) => [
      `Chapter ${chapter.number}: ${chapter.title}`,
      "",
      ...chapter.content.split(/\n{2,}/).flatMap((paragraph) => [
        ...wrapText(paragraph, 88),
        "",
      ]),
    ]),
  ];

  const pages: string[][] = [];
  let current: string[] = [];
  for (const line of allLines) {
    if (current.length >= 42) {
      pages.push(current);
      current = [];
    }
    current.push(line);
  }
  if (current.length) pages.push(current);

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((pageLines, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = makePdfPage(pageLines);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >> >> >> /Contents ${contentObjectNumber} 0 R >>`,
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
  const base = safeFilename(book.title);
  if (format === "epub") {
    return {
      filename: `${base}.epub`,
      contentType: "application/epub+zip",
      data: await buildEpub(book),
    };
  }

  return {
    filename: `${base}.pdf`,
    contentType: "application/pdf",
    data: buildPdf(book),
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
