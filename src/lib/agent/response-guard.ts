/**
 * Turning a truncated structured response into a diagnosable error.
 *
 * `max_output_tokens` bounds reasoning tokens AND visible output together. Every
 * budget in this pipeline was originally sized for the visible output alone, so
 * a role with meaningful reasoning effort could spend its whole allowance
 * thinking and emit half a JSON object.
 *
 * The SDK's `responses.parse()` throws a bare `SyntaxError` from JSON.parse when
 * that happens — "Unterminated string in JSON at position 2881" — which names
 * neither the role, nor the budget, nor the cause. That error cost a whole book
 * generation and a long detour to diagnose. This wrapper makes the next one
 * self-explanatory.
 *
 * Budgets are ceilings, not spend: you are billed for tokens actually generated,
 * so setting them generously is close to free insurance.
 */

const JSON_TRUNCATION_PATTERNS = [
  /unterminated string/i,
  /unexpected end of (json|input)/i,
  /unexpected token .* in json/i,
  /expected .*after/i,
];

export function isJsonTruncationError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return JSON_TRUNCATION_PATTERNS.some((pattern) => pattern.test(message));
}

export class TruncatedResponseError extends Error {
  readonly role: string;
  readonly maxOutputTokens: number;

  constructor(role: string, maxOutputTokens: number, cause: unknown) {
    const original = cause instanceof Error ? cause.message : String(cause);
    super(
      `${role}: the model's structured output was cut off before it was valid JSON ` +
        `(max_output_tokens=${maxOutputTokens}). Reasoning tokens are billed against ` +
        `this same budget, so a high reasoning effort can consume it before any output ` +
        `is written. Raise the budget for this role or lower its reasoning effort. ` +
        `Underlying parse error: ${original}`
    );
    this.name = "TruncatedResponseError";
    this.role = role;
    this.maxOutputTokens = maxOutputTokens;
  }
}

/**
 * Run a structured model call, converting a truncation into a named error.
 * Non-truncation failures propagate untouched so cancellation and API errors
 * keep their own handling.
 */
export async function callStructured<T>(
  role: string,
  maxOutputTokens: number,
  call: () => Promise<T>
): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (isJsonTruncationError(err)) {
      throw new TruncatedResponseError(role, maxOutputTokens, err);
    }
    throw err;
  }
}

/**
 * Convert a truncation into a named error, passing anything else through
 * untouched. Use at the catch site of a structured model call, after the
 * cancellation check.
 */
export function asTruncation(
  err: unknown,
  role: string,
  maxOutputTokens: number
): unknown {
  if (isJsonTruncationError(err)) {
    return new TruncatedResponseError(role, maxOutputTokens, err);
  }
  return err;
}
