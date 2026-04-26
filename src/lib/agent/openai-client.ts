import OpenAI from "openai";
import {
  ACTIVE_DEVELOPMENT_PLAN,
  FORCE_PRO_FOR_BETA,
  FREE_PLAN_MODEL,
  PRO_PLAN_MODEL,
  normalizePlan,
  type SubscriptionPlan,
} from "@/lib/plans";

let cached: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local before generating a book."
    );
  }
  cached = new OpenAI({ apiKey });
  return cached;
}

export function getModelName(plan: SubscriptionPlan = ACTIVE_DEVELOPMENT_PLAN): string {
  if (FORCE_PRO_FOR_BETA) return PRO_PLAN_MODEL;

  const normalized = normalizePlan(plan);
  if (normalized === "free") {
    return process.env.OPENAI_FREE_MODEL ?? FREE_PLAN_MODEL;
  }
  return process.env.OPENAI_PRO_MODEL ?? process.env.OPENAI_MODEL ?? PRO_PLAN_MODEL;
}

export function getImageModelName(): string {
  return process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
}
