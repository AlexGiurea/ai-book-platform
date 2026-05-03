/**
 * Chapter-opening helpers: prose often echoes "Chapter N: Title" even though the
 * reader UI already renders a typed chapter header — skip that line for drop caps.
 */

const ROMAN_VALUES: Record<string, number> = {
  M: 1000,
  D: 500,
  C: 100,
  L: 50,
  X: 10,
  V: 5,
  I: 1,
};

/** Parse common chapter-range Roman labels (Model output uses I–XX mostly). */
export function romanNumeralToInt(roman: string): number | null {
  const s = roman.toUpperCase().trim();
  if (!s || !/^[MDCLXVI]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_VALUES[s[i]];
    const next = ROMAN_VALUES[s[i + 1]];
    if (cur == null) return null;
    if (next != null && next > cur) {
      total -= cur;
    } else {
      total += cur;
    }
  }
  return total > 0 ? total : null;
}

export function normalizeTitleForEchoCompare(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/^["'`""'']+|["'`"".'']+$/g, "")
    .replace(/\s*[.!?…]+$/g, "");
}

/** True when paragraph only repeats navigational chapter heading we already render in chrome. */
export function paragraphIsRedundantChapterHeading(
  raw: string,
  chapterNumber: number,
  chapterTitle: string
): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return false;

  const titled = normalizeTitleForEchoCompare(chapterTitle);

  const onlyTitle =
    titled.length > 0 && normalizeTitleForEchoCompare(trimmed) === titled;
  if (onlyTitle) return true;

  const m = trimmed.match(
    /^\s*(?:chapter|ch\.)\s*((?:\d+)|(?:[IVXLCDM]+))\s*[:\).\u2014\u2013-]?\s*(.*)$/i
  );
  if (!m) return false;

  const numTok = m[1]?.toUpperCase() ?? "";
  const restRaw = (m[2] ?? "").trim();

  let echoChapter: number | null = null;
  if (/^\d+$/.test(numTok)) {
    echoChapter = Number(numTok);
  } else {
    echoChapter = romanNumeralToInt(numTok);
  }
  if (echoChapter == null || echoChapter !== chapterNumber) return false;

  if (!restRaw) return true;
  const restNorm = normalizeTitleForEchoCompare(restRaw);
  if (!titled) return true;
  return restNorm === titled;
}

/** Index of first body paragraph that should carry the ornamental cap (within this page slice). */
export function firstChapterDropCapParagraphIndex(
  paragraphs: string[],
  isChapterStart: boolean,
  chapterNumber: number,
  chapterTitle: string
): number {
  if (!isChapterStart) return -1;
  let i = 0;
  while (
    i < paragraphs.length &&
    paragraphIsRedundantChapterHeading(paragraphs[i], chapterNumber, chapterTitle)
  ) {
    i++;
  }
  return i < paragraphs.length ? i : -1;
}

/**
 * Split opening paragraph into prefix + first letter grapheme (+ combining marks)
 * so the ornamental cap aligns with narrative text, not "Chapter".
 */
export function splitDropCapLeadingSpan(text: string): {
  prefix: string;
  letter: string;
  remainder: string;
} | null {
  const leadWs = text.match(/^\s*/)?.[0] ?? "";
  const body = text.slice(leadWs.length);
  if (!body.trim()) return null;
  let lead = 0;
  while (lead < body.length) {
    const ch = body[lead];
    if (/[\s\u00a0"'""''`\u2018\u2019\u201c\u201d\-–—[\u005B(\u0028*{]/.test(ch)) lead++;
    else break;
  }
  const tail = body.slice(lead);
  const m = tail.match(/^(\p{L}[\p{M}]*)/u);
  if (!m) return null;
  const letter = m[1];
  const prefix = leadWs + body.slice(0, lead);
  const remainder = tail.slice(letter.length);
  return { prefix, letter, remainder };
}
