export type SubscriptionPlan = "free" | "pro";

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
  features: string[];
  limits: {
    books: string;
    manuscripts: string;
    exports: string;
    queue: string;
    covers: string;
    support: string;
  };
}

export const FREE_PLAN_MODEL = "gpt-5.4-mini";
export const PRO_PLAN_MODEL = "gpt-5.5";

export const DEFAULT_SIGNUP_PLAN: SubscriptionPlan = "free";
export const FALLBACK_PROJECT_PLAN: SubscriptionPlan = DEFAULT_SIGNUP_PLAN;

export const PLAN_DEFINITIONS: Record<SubscriptionPlan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "/ month",
    model: FREE_PLAN_MODEL,
    modelLabel: "GPT-5.4 mini",
    summary:
      "A focused way to try Folio, draft shorter books, and keep a private library before upgrading.",
    bestFor: "Exploring ideas, sample projects, and early outlines",
    cta: "Start free",
    href: "/signup?plan=free",
    features: [
      "Private account library",
      "Idea, upload, and canvas intake",
      "Book blueprint review before writing",
      "Beautiful in-app reader",
      "Smaller model tuned for lower-cost exploration",
    ],
    limits: {
      books: "1 active generated book",
      manuscripts: "Short-form drafts and structured previews",
      exports: "Reader access only",
      queue: "Standard queue",
      covers: "Basic cover direction",
      support: "Community-style self serve",
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$19",
    cadence: "/ month",
    badge: "Current beta default",
    model: PRO_PLAN_MODEL,
    modelLabel: "GPT-5.5",
    summary:
      "The full creative engine for serious manuscripts, richer planning, longer writing runs, and publishing polish.",
    bestFor: "Authors building complete books and repeatable publishing workflows",
    cta: "Use Pro",
    href: "/signup?plan=pro",
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
    featured: true,
    features: [
      "Everything in Free",
      "Full-length manuscript generation",
      "Premium planning and chapter continuity",
      "Priority generation jobs",
      "Cover generation and retry path",
      "Prepared export path for PDF and EPUB",
    ],
    limits: {
      books: "Multiple active books",
      manuscripts: "Longer manuscripts with deeper continuity",
      exports: "PDF and EPUB path prepared",
      queue: "Priority queue",
      covers: "Premium covers and retries",
      support: "Priority product feedback loop",
    },
  },
};

export const PLAN_ORDER: SubscriptionPlan[] = ["free", "pro"];

export function normalizePlan(value: unknown): SubscriptionPlan {
  return value === "free" || value === "pro" ? value : DEFAULT_SIGNUP_PLAN;
}

export function getPlanDefinition(plan: unknown): PlanDefinition {
  return PLAN_DEFINITIONS[normalizePlan(plan)];
}

export function getModelForPlan(plan: unknown): string {
  return getPlanDefinition(plan).model;
}

export function getProEmailSet(): Set<string> {
  return new Set(
    (process.env.FOLIO_PRO_EMAILS ?? process.env.FOLIO_OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function getInitialPlanForEmail(email: string): SubscriptionPlan {
  return getProEmailSet().has(email.trim().toLowerCase())
    ? "pro"
    : DEFAULT_SIGNUP_PLAN;
}

export function canCreateProject(plan: unknown, existingProjectCount: number): boolean {
  const normalized = normalizePlan(plan);
  if (normalized === "pro") return true;
  return existingProjectCount < 1;
}

export function canUseLength(plan: unknown, length: unknown): boolean {
  const normalized = normalizePlan(plan);
  if (normalized === "pro") return true;
  return length === "dev" || length === "short" || length === "medium";
}
