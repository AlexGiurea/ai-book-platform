/** Deterministic generation job dedupe keys for pipeline v3. */

export const INITIAL_PLANNING_RUN_ID = "initial";

/**
 * Total revision attempts per flagged batch: the first pass plus one retry when
 * the verifier reports the fix did not land. Attempt 1 keeps the unsuffixed key
 * so books already in flight are unaffected.
 */
export const MAX_REVISION_ATTEMPTS = 2;

export function normalizePlanningRunId(value: unknown): string {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : INITIAL_PLANNING_RUN_ID;
}

export const JobKeys = {
  plan: (planningRunId: string = INITIAL_PLANNING_RUN_ID) =>
    `plan:${normalizePlanningRunId(planningRunId)}`,
  /** Compatibility alias for initial project creation. */
  planInitial: () => `plan:${INITIAL_PLANNING_RUN_ID}`,
  planBatches: (planningRunId: string, start: number, end: number) =>
    `plan_batches:${normalizePlanningRunId(planningRunId)}:${start}-${end}`,
  planAudit: (planningRunId: string, pass: number) =>
    `plan_audit:${normalizePlanningRunId(planningRunId)}:${pass}`,
  planRepair: (planningRunId: string) =>
    `plan_repair:${normalizePlanningRunId(planningRunId)}:1`,
  write: (batchNumber: number) => `write:${batchNumber}`,
  critique: (chapterNumber: number) => `critique:${chapterNumber}`,
  revise: (chapterNumber: number, batchNumber: number, attempt: number = 1) =>
    attempt <= 1
      ? `revise:${chapterNumber}:${batchNumber}`
      : `revise:${chapterNumber}:${batchNumber}:a${attempt}`,
  verifyRevision: (
    chapterNumber: number,
    batchNumber: number,
    attempt: number = 1
  ) =>
    attempt <= 1
      ? `verify_revision:${chapterNumber}:${batchNumber}`
      : `verify_revision:${chapterNumber}:${batchNumber}:a${attempt}`,
  coverInitial: () => "cover:initial",
  coverRegen: () => `cover:regen:${Date.now().toString(36)}`,
} as const;

/**
 * The writer skips the model entirely when a batch already carries this key, so
 * a retry MUST mint a distinct one or the second attempt silently no-ops.
 */
export function revisionKeyFor(
  chapterNumber: number,
  batchNumber: number,
  attempt: number = 1
): string {
  return attempt <= 1
    ? `rev:${chapterNumber}:${batchNumber}`
    : `rev:${chapterNumber}:${batchNumber}:a${attempt}`;
}
