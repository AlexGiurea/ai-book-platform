/**
 * Words are the unit Folio sells.
 *
 * The old model was a flat $19/month for unlimited books at any length, and it
 * could not work: measured cost of goods runs from $1.30 for a 12,000-word book
 * to $38.99 for a 188,000-word one, so a single tome cost 2x a month's
 * revenue. Nothing about a flat price survives a 30x spread in what a click
 * costs to serve.
 *
 * What makes metering work is that the spread is almost entirely volume, not
 * rate. Per thousand words, cost only moves from $0.108 (dev) to $0.207 (tome)
 * — under 2x — because the only superlinear term is the manuscript being
 * re-sent on each writer, reviser and critic call. So a single price per
 * thousand words holds a healthy margin across the entire length menu, needs no
 * cap, and matches how someone already thinks about buying a book.
 *
 * This module is client-safe on purpose: the pricing page, the create page and
 * the API all have to agree on what a book costs, and the only way to guarantee
 * that is for them to read the same numbers.
 */

import type { LengthPreset } from "@/lib/agent/types";

/**
 * Target words per length preset. Single source of truth — the store derives
 * batch counts from this, the pricing page quotes it, and the allowance check
 * spends against it.
 */
export const LENGTH_TARGET_WORDS: Record<LengthPreset, number> = {
  dev: 12_000,
  short: 24_000,
  medium: 40_000,
  long: 60_000,
  large: 120_000,
  tome: 188_000,
};

export const LENGTH_ORDER: LengthPreset[] = [
  "dev",
  "short",
  "medium",
  "long",
  "large",
  "tome",
];

export type SubscriptionPlan = "free" | "author" | "novelist";

/**
 * Legacy value. Every account created before metering carries plan='pro', which
 * was the $19 unlimited tier, so it maps to the $19 metered tier.
 */
const LEGACY_PLAN_ALIASES: Record<string, SubscriptionPlan> = {
  pro: "author",
};

export const DEFAULT_SIGNUP_PLAN: SubscriptionPlan = "free";

export function normalizePlan(value: unknown): SubscriptionPlan {
  if (value === "free" || value === "author" || value === "novelist") return value;
  if (typeof value === "string" && LEGACY_PLAN_ALIASES[value]) {
    return LEGACY_PLAN_ALIASES[value];
  }
  return DEFAULT_SIGNUP_PLAN;
}

/**
 * Whether a plan is paid. Code used to ask `plan === "pro"`, which conflated
 * three different questions — is it paid, does it get the strong model, does it
 * get exports — and broke the moment there were two paid tiers.
 */
export function isPaidPlan(plan: unknown): boolean {
  return normalizePlan(plan) !== "free";
}

/** Words included per calendar month, by plan. */
export const PLAN_MONTHLY_WORDS: Record<SubscriptionPlan, number> = {
  free: 12_000,
  author: 40_000,
  novelist: 120_000,
};

/**
 * What a customer pays beyond their allowance. Not chargeable yet — there is no
 * payment path — so the API blocks instead of billing, and this rate exists to
 * quote the shortfall honestly rather than to invoice it.
 *
 * At the worst per-word cost on the menu ($0.207/1k at tome length) this still
 * holds ~70% margin, which is the point: overage must never be a loss leader,
 * because the longest books are exactly where people will overspend.
 */
export const OVERAGE_USD_PER_1K_WORDS = 0.6;

/** Owner accounts are not metered. Set FOLIO_OWNER_EMAILS to grant this. */
export const UNLIMITED_WORDS = Number.POSITIVE_INFINITY;

export function monthlyWordsFor(plan: unknown, isOwner = false): number {
  if (isOwner) return UNLIMITED_WORDS;
  return PLAN_MONTHLY_WORDS[normalizePlan(plan)];
}

export function wordsForLength(length: unknown): number {
  const preset = length as LengthPreset;
  return LENGTH_TARGET_WORDS[preset] ?? LENGTH_TARGET_WORDS.medium;
}

/**
 * The allowance period. Calendar months in UTC for now; when subscriptions
 * arrive this becomes the billing anchor, and it is deliberately the ONLY place
 * that decision lives so swapping it cannot desynchronise the ledger from the
 * UI.
 */
export function periodStart(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function periodEnd(now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const next = new Date(Date.UTC(year, month + 1, 1));
  return next.toISOString().slice(0, 10);
}

export interface Affordability {
  ok: boolean;
  allowance: number;
  used: number;
  remaining: number;
  requested: number;
  /** Words the request exceeds the allowance by. Zero when it fits. */
  shortfall: number;
  /** What the shortfall would cost once overage billing exists. */
  shortfallUsd: number;
  unlimited: boolean;
}

export function checkAffordability(input: {
  allowance: number;
  used: number;
  requested: number;
}): Affordability {
  const { allowance, used, requested } = input;
  const unlimited = !Number.isFinite(allowance);
  const remaining = unlimited
    ? UNLIMITED_WORDS
    : Math.max(0, allowance - Math.max(0, used));
  const shortfall = unlimited ? 0 : Math.max(0, requested - remaining);
  return {
    ok: shortfall === 0,
    allowance,
    used: Math.max(0, used),
    remaining,
    requested,
    shortfall,
    shortfallUsd: (shortfall / 1000) * OVERAGE_USD_PER_1K_WORDS,
    unlimited,
  };
}

/**
 * Internal margin visibility, not a customer-facing number.
 *
 * Fitted to two fully measured books — 11,117 words at $1.21 and 36,635 words
 * whose tokens repriced to $4.26 on Sol — and it reproduces both exactly. Input
 * scales superlinearly because every writer, reviser and critic call re-sends
 * the manuscript written so far.
 *
 * What it projects:
 *   dev     12,000w   $1.30    $0.108/1k
 *   short   24,000w   $2.65    $0.110/1k
 *   medium  40,000w   $4.72    $0.118/1k
 *   long    60,000w   $7.76    $0.129/1k
 *   large  120,000w  $19.87    $0.166/1k
 *   tome   188,000w  $38.99    $0.207/1k
 *
 * Beyond ~60,000 words this is extrapolation. The quadratic term is a real
 * mechanism rather than curve-fitting, so the shape holds, but treat the
 * absolute figure as +/-25% until a long book is actually measured.
 */
const INPUT_TOKENS_PER_WORD = 7.86;
const INPUT_TOKENS_PER_WORD_SQUARED = 1.679e-4;
/**
 * Output carries a fixed floor — the planner emits a whole blueprint whether the
 * book is 12,000 words or 188,000 — so short books cost more per word than a
 * purely proportional model predicts. Treating output as proportional
 * underestimated the dev book by 15%.
 */
const OUTPUT_TOKENS_FIXED = 6_741;
const OUTPUT_TOKENS_PER_WORD = 3.055;
/** Blended across roles and models, including the cache-write surcharge. */
const EFFECTIVE_INPUT_USD_PER_TOKEN = 3.7e-6;
const EFFECTIVE_OUTPUT_USD_PER_TOKEN = 19.9e-6;

export function estimatedCogsUsd(words: number): number {
  if (words <= 0) return 0;
  const inputTokens =
    INPUT_TOKENS_PER_WORD * words + INPUT_TOKENS_PER_WORD_SQUARED * words * words;
  const outputTokens = OUTPUT_TOKENS_FIXED + OUTPUT_TOKENS_PER_WORD * words;
  return (
    inputTokens * EFFECTIVE_INPUT_USD_PER_TOKEN +
    outputTokens * EFFECTIVE_OUTPUT_USD_PER_TOKEN
  );
}

export function formatWords(words: number): string {
  if (!Number.isFinite(words)) return "Unlimited";
  if (words >= 1000) return `${Math.round(words / 1000).toLocaleString()}k`;
  return words.toLocaleString();
}
