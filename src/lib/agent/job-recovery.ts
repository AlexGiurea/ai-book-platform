import type { GenerationJobType } from "./types";

export type ExhaustedJobRecovery =
  | "hard_fail"
  | "plan_warning"
  | "quality_continue"
  | "finish_book"
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
  // The manuscript is already written by this point. A failed audit or repair
  // must never strand a finished book — ship what exists.
  if (type === "book_audit" || type === "book_repair") {
    return "finish_book";
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
