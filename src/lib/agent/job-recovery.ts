import type { GenerationJobType } from "./types";

export type ExhaustedJobRecovery =
  | "hard_fail"
  | "plan_warning"
  | "quality_continue"
  | "cover_fail";

export function classifyExhaustedJob(
  type: GenerationJobType
): ExhaustedJobRecovery {
  if (type === "plan" || type === "plan_batches" || type === "write") {
    return "hard_fail";
  }
  if (type === "plan_audit" || type === "plan_repair") {
    return "plan_warning";
  }
  if (
    type === "critique_chapter" ||
    type === "revise_batch" ||
    type === "verify_revision"
  ) {
    return "quality_continue";
  }
  return "cover_fail";
}
