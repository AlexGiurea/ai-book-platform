export interface PageEstimateChapter {
  title: string;
  content: string;
}

const PDF_BODY_TOP = 533.7;
const PDF_BODY_BOTTOM = 78.3;
const PDF_LINE_HEIGHT = 20.7;
const PDF_LINES_PER_BODY_PAGE =
  Math.floor((PDF_BODY_TOP - PDF_BODY_BOTTOM) / PDF_LINE_HEIGHT) + 1;

const PDF_FIRST_LINE_WIDTH = 52;
const PDF_CONTINUATION_LINE_WIDTH = 60;

// Conservative fallback that tracks the exported PDF's small A5 page size much
// better than reader-mode estimates. Exact project counts use chapter text.
const ESTIMATED_PDF_WORDS_PER_BODY_PAGE = 150;

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

function bodyPageCount(content: string): number {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  let lines = 0;
  for (const paragraph of paragraphs) {
    const firstPass = wrapText(paragraph, PDF_FIRST_LINE_WIDTH);
    const paragraphLines =
      firstPass.length <= 1
        ? firstPass.length
        : 1 + wrapText(firstPass.slice(1).join(" "), PDF_CONTINUATION_LINE_WIDTH).length;
    lines += paragraphLines;
  }

  return Math.max(1, Math.ceil(lines / PDF_LINES_PER_BODY_PAGE));
}

export function estimatePdfPagesFromChapters(
  chapters: PageEstimateChapter[],
  options: { hasCover?: boolean } = {}
): number {
  const frontMatterPages = 2 + (options.hasCover ? 1 : 0); // title + blank + optional image cover
  if (!chapters.length) return frontMatterPages;

  return chapters.reduce(
    (total, chapter) => total + 1 + bodyPageCount(chapter.content), // chapter title + body pages
    frontMatterPages
  );
}

export function estimatePdfPagesFromWordCount(
  wordCount: number,
  options: { chapterCount?: number; hasCover?: boolean } = {}
): number {
  const frontMatterPages = 2 + (options.hasCover ? 1 : 0);
  const chapterCount = Math.max(1, options.chapterCount ?? 1);
  const bodyPages = Math.max(
    1,
    Math.ceil(Math.max(0, wordCount) / ESTIMATED_PDF_WORDS_PER_BODY_PAGE)
  );
  return frontMatterPages + chapterCount + bodyPages;
}
