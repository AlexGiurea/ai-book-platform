/**
 * How much prose the writer produces per model call.
 *
 * "batch" (~2,800 words) is the original unit. "chapter" (~8,400 words) exists
 * because of a measured cost property, not a guess about craft.
 *
 * The manuscript is re-sent in full on every writer call and cannot be cached —
 * only a byte-identical `instructions` field caches on this API, and the
 * manuscript grows. So redundant input scales with the NUMBER of calls, not
 * their size: a 14-batch book re-reads ~315,000 tokens it has already paid for,
 * where the same book in 5 chapter-sized calls re-reads ~97,000. That is a ~70%
 * cut in redundant input for free.
 *
 * The craft argument points the same way — a chapter written as one unit can
 * shape its own arc instead of being assembled from three blind thirds — but
 * that is the part that needs measuring rather than asserting, which is why this
 * is a switch and not a replacement. Run both, score both, then decide.
 */

import type { BatchBlueprint, StoryBible } from "./types";

export type WriteGranularity = "batch" | "chapter";

export const DEFAULT_WRITE_GRANULARITY: WriteGranularity = "batch";

export function normalizeWriteGranularity(value: unknown): WriteGranularity {
  return value === "chapter" ? "chapter" : DEFAULT_WRITE_GRANULARITY;
}

export function readWriteGranularity(
  env: Record<string, string | undefined> = process.env
): WriteGranularity {
  const raw = env.FOLIO_WRITE_GRANULARITY;
  if (raw == null) return DEFAULT_WRITE_GRANULARITY;
  return normalizeWriteGranularity(raw.trim().toLowerCase());
}

/** Blueprints belonging to one chapter, in batch order. */
export function chapterBlueprints(
  bible: Pick<StoryBible, "batches">,
  chapterNumber: number
): BatchBlueprint[] {
  return bible.batches
    .filter((b) => b.chapterNumber === chapterNumber)
    .sort((a, b) => a.number - b.number);
}

/**
 * The chapter a given batch belongs to, or undefined if the blueprint has no
 * entry for it. Used to map a queued `write:N` job onto a chapter-sized call.
 */
export function chapterForBatch(
  bible: Pick<StoryBible, "batches">,
  batchNumber: number
): number | undefined {
  return bible.batches.find((b) => b.number === batchNumber)?.chapterNumber;
}

/**
 * Batches in this chapter that still need writing.
 *
 * A chapter is only written as a unit when NONE of it exists yet. If a chapter
 * is half-written — a resumed run, a partial failure — fall back to per-batch
 * so the existing rows are not clobbered and idempotency is preserved.
 */
export function pendingChapterBlueprints(
  bible: Pick<StoryBible, "batches">,
  chapterNumber: number,
  writtenBatchNumbers: number[]
): { blueprints: BatchBlueprint[]; partiallyWritten: boolean } {
  const written = new Set(writtenBatchNumbers);
  const all = chapterBlueprints(bible, chapterNumber);
  const pending = all.filter((b) => !written.has(b.number));
  return {
    blueprints: pending,
    partiallyWritten: pending.length > 0 && pending.length !== all.length,
  };
}

/**
 * Total words a chapter-sized call should aim for: the sum of its blueprint
 * targets, so chapter mode inherits whatever length discipline the plan set.
 */
export function chapterTargetWords(blueprints: BatchBlueprint[]): number {
  return blueprints.reduce((sum, b) => sum + (b.targetWords || 0), 0);
}
