/**
 * Plans, as presented to a customer.
 *
 * The numbers live in `@/lib/billing/allowance` and are re-exported here so the
 * marketing surface and the enforcement path can never disagree about what a
 * plan includes. If you are changing what something costs, change it there.
 */

import {
  DEFAULT_SIGNUP_PLAN,
  LENGTH_TARGET_WORDS,
  OVERAGE_USD_PER_1K_WORDS,
  PLAN_MONTHLY_WORDS,
  isPaidPlan,
  normalizePlan,
  type SubscriptionPlan,
} from "@/lib/billing/allowance";

export {
  DEFAULT_SIGNUP_PLAN,
  OVERAGE_USD_PER_1K_WORDS,
  PLAN_MONTHLY_WORDS,
  isPaidPlan,
  normalizePlan,
};
export type { SubscriptionPlan };

/** The plan a project falls back to when none is recorded. */
export const FALLBACK_PROJECT_PLAN: SubscriptionPlan = DEFAULT_SIGNUP_PLAN;

export const FREE_PLAN_MODEL = "gpt-5.6-luna";
export const PAID_PLAN_MODEL = "gpt-5.6-sol";
/** @deprecated Legacy name kept so older imports keep resolving. */
export const PRO_PLAN_MODEL = PAID_PLAN_MODEL;

export interface PlanDefinition {
  id: SubscriptionPlan;
  name: string;
  price: string;
  cadence: string;
  badge?: string;
  model: string;
  modelLabel: string;
  summary: string;
  bestFor: string;
  cta: string;
  href: string;
  stripePriceEnv?: string;
  featured?: boolean;
  /** Words included each month. The whole product in one number. */
  monthlyWords: number;
  /** Plain-language example of what the allowance buys. */
  allowanceExample: string;
  features: string[];
  limits: {
    words: string;
    books: string;
    manuscripts: string;
    exports: string;
    queue: string;
    covers: string;
    support: string;
  };
}

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "/ month",
    model: FREE_PLAN_MODEL,
    modelLabel: "GPT-5.6 Luna",
    monthlyWords: PLAN_MONTHLY_WORDS.free,
    allowanceExample: "One novella of about 12,000 words",
    summary:
      "Write one short book a month and keep it in your library. Enough to see what Folio does with an idea before you pay for anything.",
    bestFor: "Trying an idea end to end",
    cta: "Start free",
    href: "/signup?plan=free",
    features: [
      "12,000 words every month",
      "Idea, upload, and canvas intake",
      "Book blueprint review before writing",
      "Beautiful in-app reader",
      "Private account library",
    ],
    limits: {
      words: "12,000 words / month",
      books: "About one novella",
      manuscripts: "Full pipeline, lighter model",
      exports: "Reader access only",
      queue: "Standard queue",
      covers: "Basic cover direction",
      support: "Self serve",
    },
  },
  author: {
    id: "author",
    name: "Author",
    price: "$19",
    cadence: "/ month",
    badge: "Most popular",
    model: PAID_PLAN_MODEL,
    modelLabel: "GPT-5.6 Sol",
    monthlyWords: PLAN_MONTHLY_WORDS.author,
    allowanceExample: "One full novel of about 40,000 words",
    featured: true,
    stripePriceEnv: "STRIPE_AUTHOR_PRICE_ID",
    summary:
      "The full engine on the strongest model, with enough words each month for a complete novel — or several shorter books.",
    bestFor: "Finishing a real book",
    cta: "Choose Author",
    href: "/signup?plan=author",
    features: [
      "Everything in Free",
      "40,000 words every month",
      "Strongest model on every stage",
      "Whole-book continuity audit and repair",
      "Cover generation and retries",
      "PDF and EPUB export",
    ],
    limits: {
      words: "40,000 words / month",
      books: "One novel, or a few novellas",
      manuscripts: "Full-length with deep continuity",
      exports: "PDF and EPUB",
      queue: "Priority queue",
      covers: "Premium covers and retries",
      support: "Priority feedback loop",
    },
  },
  novelist: {
    id: "novelist",
    name: "Novelist",
    price: "$49",
    cadence: "/ month",
    model: PAID_PLAN_MODEL,
    modelLabel: "GPT-5.6 Sol",
    monthlyWords: PLAN_MONTHLY_WORDS.novelist,
    allowanceExample: "One epic of about 120,000 words",
    stripePriceEnv: "STRIPE_NOVELIST_PRICE_ID",
    summary:
      "For long-form work. Enough words each month for an epic, or a steady run of novels, at the best rate Folio offers.",
    bestFor: "Long books, or a book a month",
    cta: "Choose Novelist",
    href: "/signup?plan=novelist",
    features: [
      "Everything in Author",
      "120,000 words every month",
      "Best per-word rate",
      "Longest length presets",
      "Notion library sync",
      "Direct product feedback line",
    ],
    limits: {
      words: "120,000 words / month",
      books: "One epic, or three novels",
      manuscripts: "Every length preset",
      exports: "PDF and EPUB",
      queue: "Priority queue",
      covers: "Premium covers and retries",
      support: "Direct line",
    },
  },
};

export const PLAN_ORDER: SubscriptionPlan[] = ["free", "author", "novelist"];

export function getPlanDefinition(plan: unknown): PlanDefinition {
  return PLAN_DEFINITIONS[normalizePlan(plan)];
}

export function getModelForPlan(plan: unknown): string {
  return getPlanDefinition(plan).model;
}

/** Price per 1,000 words a plan works out to. Used to show the better rate. */
export function usdPer1kWords(plan: unknown): number {
  const definition = getPlanDefinition(plan);
  const price = Number(definition.price.replace(/[^0-9.]/g, ""));
  if (!price || !definition.monthlyWords) return 0;
  return price / (definition.monthlyWords / 1000);
}

/**
 * Roughly how many books of a given length an allowance covers. Deliberately
 * conservative: it floors, so the number shown is one someone can actually get.
 */
export function booksPerMonth(
  plan: unknown,
  length: keyof typeof LENGTH_TARGET_WORDS
): number {
  return Math.floor(getPlanDefinition(plan).monthlyWords / LENGTH_TARGET_WORDS[length]);
}

export function getProEmailSet(): Set<string> {
  return new Set(
    (process.env.FOLIO_PRO_EMAILS ?? process.env.FOLIO_OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Owner accounts are unmetered — see monthlyWordsFor(). */
export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getProEmailSet().has(email.trim().toLowerCase());
}

export function getInitialPlanForEmail(email: string): SubscriptionPlan {
  return isOwnerEmail(email) ? "novelist" : DEFAULT_SIGNUP_PLAN;
}
