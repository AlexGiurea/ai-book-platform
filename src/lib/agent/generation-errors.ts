export const GENERATION_CANCELLED_MESSAGE = "Generation was stopped.";

export class GenerationCancelledError extends Error {
  readonly code = "GENERATION_CANCELLED" as const;
  constructor(message = GENERATION_CANCELLED_MESSAGE) {
    super(message);
    this.name = "GenerationCancelledError";
  }
}

export function isGenerationCancelled(
  err: unknown
): err is GenerationCancelledError {
  return err instanceof GenerationCancelledError;
}

export function toGenerationCancelled(
  err: unknown
): GenerationCancelledError | null {
  if (isGenerationCancelled(err)) return err;
  if (err instanceof Error) {
    const n = err.name;
    const m = err.message;
    if (n === "AbortError" || m.includes("The user aborted a request") || m.includes("aborted")) {
      return new GenerationCancelledError();
    }
  }
  return null;
}
