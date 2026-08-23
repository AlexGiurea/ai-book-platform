/**
 * What the writer gets to read before it writes.
 *
 * The old answer was one previous batch of prose plus eight one-line summaries,
 * which meant that by batch 43 the writer had never seen batches 1 through 34.
 * Every continuity defect the judge found — a revolver reloading itself, a knife
 * returning from a corpse, a wound changing sides — lives in that blind spot.
 *
 * The new answer is the whole manuscript. A finished 162,000-word book is about
 * 216,000 tokens against a 1,050,000-token window, so it fits with room to
 * spare. The reason it is also *cheap* is that the manuscript is append-only:
 * the call for batch N sees batches 1..N-1, and the call for batch N+1 sees
 * exactly those same bytes plus one more batch. That makes it a perfect prompt
 * cache prefix — read at a 90% discount, with only the newest batch paying a
 * write premium.
 *
 * The append-only property is load-bearing. A sliding window that drops the
 * oldest batch each call would invalidate the prefix every single time and cost
 * more than the design it replaced, while also being worse. Everything here
 * exists to keep the included range a stable prefix for as long as possible.
 */

import type { Batch } from "./types";

/** Rough tokens per word for English prose on GPT-5.6 tokenizers. */
export const TOKENS_PER_WORD = 1.33;

/**
 * Ceiling on prose tokens fed to the writer. Set well above any current length
 * preset — `tome` (188k words) lands near 250k tokens — so this is a guard rail
 * against a runaway project, not part of the normal path.
 */
export const DEFAULT_CONTEXT_TOKEN_BUDGET = 400_000;

/**
 * When the budget is exceeded the included range must start later, which breaks
 * the cache prefix. Advancing the cut in blocks means that break happens once
 * every N calls instead of on every call.
 */
export const TRUNCATION_BLOCK_BATCHES = 8;

export type ManuscriptWindowMode = "full-manuscript" | "truncated";

export interface ManuscriptWindow {
  /** Batches included as complete prose, in ascending order. */
  fullProse: Batch[];
  /** Older batches represented only by their summary, in ascending order. */
  summarized: Batch[];
  /** Estimated prose tokens in `fullProse`. */
  estimatedTokens: number;
  mode: ManuscriptWindowMode;
}

export function estimateProseTokens(batch: Batch): number {
  return Math.ceil(batch.wordCount * TOKENS_PER_WORD);
}

export function readContextTokenBudget(
  env: Record<string, string | undefined> = process.env
): number {
  const raw = env.FOLIO_WRITER_CONTEXT_TOKEN_BUDGET;
  if (raw == null) return DEFAULT_CONTEXT_TOKEN_BUDGET;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CONTEXT_TOKEN_BUDGET;
  }
  return parsed;
}

/**
 * Choose how much of the manuscript to include.
 *
 * Normal case: everything, in order, starting at batch 1 — a stable prefix that
 * only ever grows at the end.
 *
 * Over budget: drop whole blocks from the front, keeping the most recent prose
 * (which carries voice continuity) and summarizing what fell off. The cut point
 * is quantised to `TRUNCATION_BLOCK_BATCHES` so the surviving range stays
 * byte-identical across several consecutive calls.
 */
export function selectManuscriptWindow(
  priorBatches: Batch[],
  budgetTokens: number = DEFAULT_CONTEXT_TOKEN_BUDGET
): ManuscriptWindow {
  const ordered = [...priorBatches].sort((a, b) => a.batchNumber - b.batchNumber);

  const totalTokens = ordered.reduce((sum, b) => sum + estimateProseTokens(b), 0);
  if (totalTokens <= budgetTokens) {
    return {
      fullProse: ordered,
      summarized: [],
      estimatedTokens: totalTokens,
      mode: "full-manuscript",
    };
  }

  // Walk the cut forward one block at a time until the tail fits. Quantising to
  // blocks is what keeps the cache prefix stable between truncation steps.
  let dropCount = 0;
  let tailTokens = totalTokens;
  while (dropCount < ordered.length && tailTokens > budgetTokens) {
    const block = ordered.slice(dropCount, dropCount + TRUNCATION_BLOCK_BATCHES);
    tailTokens -= block.reduce((sum, b) => sum + estimateProseTokens(b), 0);
    dropCount += block.length;
  }

  return {
    fullProse: ordered.slice(dropCount),
    summarized: ordered.slice(0, dropCount),
    estimatedTokens: Math.max(0, tailTokens),
    mode: "truncated",
  };
}
