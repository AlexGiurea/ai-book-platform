/**
 * Published list pricing per million tokens, used to turn `llm_usage` rows into
 * dollars. Prices are a snapshot — verify against the vendor before quoting a
 * figure externally, and add a `verifiedOn` bump whenever you refresh them.
 */

export const PRICING_VERIFIED_ON = "2026-08-23";

export interface ModelPrice {
  /** USD per 1M uncached input tokens. */
  input: number;
  /** USD per 1M tokens served from cache. */
  cachedInput: number;
  /** USD per 1M output tokens (reasoning tokens bill at this rate). */
  output: number;
  vendor: "openai" | "anthropic";
}

/**
 * Cache writes carry a premium over the uncached input rate on both vendors
 * (1.25x for the default TTL). Anthropic's 1-hour TTL is 2x — not modelled here
 * because nothing in Folio requests it yet.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;

export const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-5.6-sol": { input: 5.0, cachedInput: 0.5, output: 30.0, vendor: "openai" },
  "gpt-5.6-terra": { input: 2.0, cachedInput: 0.2, output: 12.0, vendor: "openai" },
  "gpt-5.6-luna": { input: 0.2, cachedInput: 0.02, output: 1.2, vendor: "openai" },
  "gpt-5.5": { input: 5.0, cachedInput: 0.5, output: 30.0, vendor: "openai" },
  "claude-fable-5": { input: 10.0, cachedInput: 1.0, output: 50.0, vendor: "anthropic" },
  "claude-opus-5": { input: 5.0, cachedInput: 0.5, output: 25.0, vendor: "anthropic" },
  "claude-sonnet-5": { input: 3.0, cachedInput: 0.3, output: 15.0, vendor: "anthropic" },
  "claude-haiku-4-5": { input: 1.0, cachedInput: 0.1, output: 5.0, vendor: "anthropic" },
  /**
   * Image model. Text-input and image-output rates; image *input* is $8/1M and
   * is not modelled because Folio only sends text to it. Without this row the
   * cover was excluded from every total, under-reporting each book by ~$0.20.
   */
  "gpt-image-2": { input: 5.0, cachedInput: 1.25, output: 30.0, vendor: "openai" },
};

export interface TokenCounts {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export interface CostBreakdown {
  model: string;
  priced: boolean;
  inputCost: number;
  cachedInputCost: number;
  cacheWriteCost: number;
  outputCost: number;
  totalCost: number;
}

/**
 * `inputTokens` from the Responses API is the *total* input, and both
 * `cachedInputTokens` and `cacheWriteTokens` are subsets of it — not separate
 * buckets. Verified empirically against a real call: a 104,475-token judge
 * prompt reported 104,472 cache-write tokens on the same request.
 *
 * Billing each subset on top of the full input would charge cache writes at
 * 2.25x instead of 1.25x and overstate a cold-cache call by roughly 40%. So the
 * uncached remainder is what's left after removing both subsets, and each
 * subset is then priced at its own rate.
 *
 * Guard the remainder at zero — a provider that reports overlapping subsets
 * would otherwise silently produce a credit.
 */
export function costForUsage(model: string, tokens: TokenCounts): CostBreakdown {
  const price = MODEL_PRICES[model];
  if (!price) {
    return {
      model,
      priced: false,
      inputCost: 0,
      cachedInputCost: 0,
      cacheWriteCost: 0,
      outputCost: 0,
      totalCost: 0,
    };
  }

  const uncachedInput = Math.max(
    0,
    tokens.inputTokens - tokens.cachedInputTokens - tokens.cacheWriteTokens
  );
  const inputCost = (uncachedInput / 1_000_000) * price.input;
  const cachedInputCost = (tokens.cachedInputTokens / 1_000_000) * price.cachedInput;
  const cacheWriteCost =
    (tokens.cacheWriteTokens / 1_000_000) * price.input * CACHE_WRITE_MULTIPLIER;
  const outputCost = (tokens.outputTokens / 1_000_000) * price.output;

  return {
    model,
    priced: true,
    inputCost,
    cachedInputCost,
    cacheWriteCost,
    outputCost,
    totalCost: inputCost + cachedInputCost + cacheWriteCost + outputCost,
  };
}

/** Share of input tokens served from cache — the health metric for prefix stability. */
export function cacheHitRate(tokens: TokenCounts): number | undefined {
  if (tokens.inputTokens <= 0) return undefined;
  return tokens.cachedInputTokens / tokens.inputTokens;
}

export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(2)}`;
}
