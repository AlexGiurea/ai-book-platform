/**
 * Keeping a book close to the length it was ordered at.
 *
 * Measured across every finished book in the database, batches averaged ~3,880
 * words against a 2,800-word target — a consistent 32-38% overrun, with one
 * batch running 83% long. Because the batch count is fixed at project creation,
 * nothing absorbs the excess: a book ordered at 120,000 words arrives at about
 * 162,000, and since output tokens are the bill, that is a third more expensive
 * than the preset implies.
 *
 * Nothing in the pipeline measured length or reacted to it. Two things here do:
 *
 * 1. A hard range instead of a soft target. "Approximately 2,800" reads as a
 *    suggestion; "between 2,520 and 3,080, never above 3,080" does not.
 * 2. Cumulative drift correction. Each batch's target is recomputed from what
 *    is actually left to write, so an overlong chapter is paid back by the ones
 *    after it rather than compounding to the end of the book.
 *
 * Deliberately no retry-on-overlong. A rewrite costs a full write call, and the
 * harness can now tell us whether the cheap fix was sufficient. Add machinery
 * only if measurement says the prompt change wasn't enough.
 */

/** Per-batch tolerance around the target communicated to the writer. */
export const LENGTH_TOLERANCE = 0.1;

/**
 * How far the adaptive target may move from the blueprint's figure. Without a
 * clamp, a badly drifted book would demand a 900-word batch or a 6,000-word one,
 * and both wreck the shape of a chapter.
 */
export const MIN_TARGET_RATIO = 0.75;
export const MAX_TARGET_RATIO = 1.1;

/** Drift below this is noise and gets no correction note. */
export const DRIFT_REPORTING_THRESHOLD = 0.05;

export interface LengthGuidanceInput {
  /** The blueprint's own figure for this batch. */
  blueprintTargetWords: number;
  /** 1-based batch being written. */
  batchNumber: number;
  totalBatches: number;
  /** Words already in the manuscript, excluding this batch. */
  wordsSoFar: number;
  /** The whole book's target. */
  bookTargetWords: number;
}

export interface LengthGuidance {
  /** What this batch should aim for, after correcting accumulated drift. */
  targetWords: number;
  minWords: number;
  maxWords: number;
  /** Words so far over words expected by now. 1.0 is on target. */
  driftRatio: number;
  /** Populated only when drift is worth telling the writer about. */
  correction?: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeLengthGuidance(
  input: LengthGuidanceInput
): LengthGuidance {
  const {
    blueprintTargetWords,
    batchNumber,
    totalBatches,
    wordsSoFar,
    bookTargetWords,
  } = input;

  const base = blueprintTargetWords > 0 ? blueprintTargetWords : 2800;
  const safeTotalBatches = Math.max(1, totalBatches);
  const batchesDone = Math.max(0, Math.min(batchNumber - 1, safeTotalBatches));
  const remainingBatches = Math.max(1, safeTotalBatches - batchesDone);

  // Expected progress by now, used only to describe drift to the writer.
  const expectedSoFar = (bookTargetWords * batchesDone) / safeTotalBatches;
  const driftRatio =
    batchesDone === 0 || expectedSoFar <= 0 ? 1 : wordsSoFar / expectedSoFar;

  // The self-correcting term: split what is actually left over the batches left.
  const remainingWords = Math.max(0, bookTargetWords - wordsSoFar);
  const idealThisBatch = remainingWords / remainingBatches;

  // A book already past its target has nothing left to spend, so ask for the
  // floor rather than the blueprint figure — otherwise overrun compounds.
  const rawTarget = idealThisBatch > 0 ? idealThisBatch : base * MIN_TARGET_RATIO;
  const targetWords = Math.round(
    clamp(rawTarget, base * MIN_TARGET_RATIO, base * MAX_TARGET_RATIO)
  );

  const minWords = Math.round(targetWords * (1 - LENGTH_TOLERANCE));
  const maxWords = Math.round(targetWords * (1 + LENGTH_TOLERANCE));

  let correction: string | undefined;
  const drift = driftRatio - 1;
  if (Math.abs(drift) >= DRIFT_REPORTING_THRESHOLD) {
    const pct = Math.abs(Math.round(drift * 100));
    correction =
      drift > 0
        ? `The manuscript is running ${pct}% LONG against its plan. Come in at the low end of the range for this batch. Cut description and transitional material, not scene beats.`
        : `The manuscript is running ${pct}% SHORT against its plan. Use the full range for this batch. Develop the beats more fully rather than adding new ones.`;
  }

  return { targetWords, minWords, maxWords, driftRatio, correction };
}
