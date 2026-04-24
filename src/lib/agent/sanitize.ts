/**
 * Deterministic "zero em dash" enforcement.
 *
 * The planner and writer prompts both forbid em dashes, en dashes (as
 * sentence-level punctuation), and double-hyphen substitutes — but LLMs slip.
 * Every field that reaches the reader or is fed back into the writer's
 * next-batch prompt goes through this scrubber so nothing dash-based leaks
 * through, regardless of what the model produced.
 *
 * Scope:
 *  - em dash: U+2014 "—"   — fully removed
 *  - en dash: U+2013 "–"   — removed only when it sits between letters
 *                            (i.e. used as sentence punctuation). Numeric
 *                            ranges like "3–5" are preserved.
 *  - double hyphen: "--"   — normalized to em dash first, then stripped
 *                            with the rest.
 *
 * Replacement strategy, applied in order:
 *  1. "Wait—" / "thought—)"  → ellipsis "…" (preserves cut-off beat)
 *  2. "—I said" / "(—what?"  → drop the dash (fragment continues cleanly)
 *  3. Any remaining "word — word" or "word—word"  → ", "
 *  4. Normalize double commas, orphan whitespace, and ", ." artifacts.
 */
export function stripEmDashes(text: string | undefined | null): string {
  if (!text) return "";

  let out = text
    // "word--word" → uniform em dash so one pass handles it below
    .replace(/(\w)\s*--\s*(\w)/g, "$1 — $2")
    // en dash used as sentence punctuation (between letters, not digits)
    .replace(/(\p{L})\s*–\s*(\p{L})/gu, "$1 — $2");

  // 1. End-of-clause cutoff: "Wait—" or (thought—)
  out = out.replace(/—(?=["'”’)\]])/g, "…");
  // 2. Start-of-clause fragment: "—I said" or (—a whisper)
  out = out.replace(/(?<=["'“‘(\[])—\s*/g, "");
  // 3. Mid-sentence aside / appositive / link
  out = out.replace(/\s*—\s*/g, ", ");

  // 4. Cleanup artifacts introduced by the swap
  out = out
    .replace(/,\s*,/g, ",")
    .replace(/,\s*\./g, ".")
    .replace(/([.!?]),\s*/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ");

  return out;
}
