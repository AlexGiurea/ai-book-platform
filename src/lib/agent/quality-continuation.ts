export interface ChapterBatchRef {
  batchNumber: number;
  chapterNumber?: number;
}

/**
 * Return the next manuscript batch after a quality-gated chapter.
 *
 * The revision target is deliberately not an input: revising batch 7 in a
 * completed chapter [7, 8, 9] must continue at 10, never at 8.
 */
export function getNextBatchAfterQualityGate(
  batches: ChapterBatchRef[],
  chapterNumber?: number
): number | undefined {
  if (chapterNumber != null) {
    const chapterNumbers = batches
      .filter((batch) => batch.chapterNumber === chapterNumber)
      .map((batch) => batch.batchNumber);
    if (!chapterNumbers.length) return undefined;
    return Math.max(...chapterNumbers) + 1;
  }

  // Legacy/malformed quality payloads may lack chapterNumber. Fall back to the
  // final written batch, never to the revision target.
  if (!batches.length) return 1;
  return Math.max(...batches.map((batch) => batch.batchNumber)) + 1;
}
