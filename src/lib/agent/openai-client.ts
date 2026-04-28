import OpenAI from "openai";
import {
  FALLBACK_PROJECT_PLAN,
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
  // Routes usage to a specific OpenAI dashboard project (OpenAI-Project header). Set OPENAI_PROJECT_ID
  // to your "AI Book-Writing" project ID (proj_...) or calls attribute to the org default project.
  const project = process.env.OPENAI_PROJECT_ID ?? null;
  cached = new OpenAI({ apiKey, project });
  return cached;
}

export function getModelName(plan: SubscriptionPlan = FALLBACK_PROJECT_PLAN): string {
  const normalized = normalizePlan(plan);
  if (normalized === "free") {
    return process.env.OPENAI_FREE_MODEL ?? FREE_PLAN_MODEL;
  }
  return process.env.OPENAI_PRO_MODEL ?? process.env.OPENAI_MODEL ?? PRO_PLAN_MODEL;
}

export function getImageModelName(): string {
  return process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
}
