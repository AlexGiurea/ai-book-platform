/** Deterministic generation job dedupe keys for pipeline v3. */

export const INITIAL_PLANNING_RUN_ID = "initial";

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
  revise: (chapterNumber: number, batchNumber: number) =>
    `revise:${chapterNumber}:${batchNumber}`,
  verifyRevision: (chapterNumber: number, batchNumber: number) =>
    `verify_revision:${chapterNumber}:${batchNumber}`,
  coverInitial: () => "cover:initial",
  coverRegen: () => `cover:regen:${Date.now().toString(36)}`,
} as const;

export function revisionKeyFor(
  chapterNumber: number,
  batchNumber: number
): string {
  return `rev:${chapterNumber}:${batchNumber}`;
}
