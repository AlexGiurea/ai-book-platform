import OpenAI from "openai";
import {
  FALLBACK_PROJECT_PLAN,
  type SubscriptionPlan,
} from "@/lib/plans";
import {
  buildPromptCacheKey,
  createPipelineConfig,
  getImageModelFromConfig,
  getModelFromConfig,
  getReasoningEffortForRole,
  isGpt56Family,
  normalizePipelineConfig,
  readEnvModel,
  type LlmRole,
  type ProjectPipelineConfig,
} from "./model-config";
import type { BookProject } from "./types";

export type { LlmRole } from "./model-config";

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
  const project = readEnvModel("OPENAI_PROJECT_ID") ?? null;
  cached = new OpenAI({ apiKey, project });
  return cached;
}

/** Resolve pipeline config from a project snapshot (or live defaults for missing rows). */
export function getProjectPipelineConfig(
  project: Pick<BookProject, "plan" | "modelConfig" | "pipelineVersion">
): ProjectPipelineConfig {
  if (project.modelConfig) {
    return normalizePipelineConfig(project.modelConfig, project.plan);
  }
  return normalizePipelineConfig(
    project.pipelineVersion
      ? { pipelineVersion: project.pipelineVersion }
      : undefined,
    project.plan
  );
}

/**
 * Role model from a project snapshot. Prefer this over env for all generation calls.
 */
export function getModelForProject(
  project: Pick<BookProject, "plan" | "modelConfig" | "pipelineVersion">,
  role: LlmRole
): string {
  return getModelFromConfig(getProjectPipelineConfig(project), role);
}

/**
 * Live env-based role lookup (legacy / UI). Generation agents should use getModelForProject.
 */
export function getModelForRole(
  role: LlmRole,
  plan: SubscriptionPlan = FALLBACK_PROJECT_PLAN
): string {
  return getModelFromConfig(createPipelineConfig(plan), role);
}

/** @deprecated Prefer getModelForProject / getModelForRole("writer", plan). */
export function getModelName(plan: SubscriptionPlan = FALLBACK_PROJECT_PLAN): string {
  return getModelForRole("writer", plan);
}

export function getImageModelName(
  project?: Pick<BookProject, "plan" | "modelConfig" | "pipelineVersion">
): string {
  if (project) {
    return getImageModelFromConfig(getProjectPipelineConfig(project));
  }
  return createPipelineConfig().models.cover;
}

export interface ResponseCallOptions {
  projectId: string;
  role: LlmRole;
  model: string;
  config: ProjectPipelineConfig;
  /** Include reasoning.effort when model is GPT-5.6 family. */
  includeReasoning?: boolean;
}

/**
 * Shared Responses API options: prompt_cache_key + optional reasoning.
 * Explicit prompt_cache_options / content breakpoints are NOT in OpenAI SDK 6.34 —
 * we rely on stable-prefix ordering + prompt_cache_key only.
 */
export function buildResponsesCallExtras(opts: ResponseCallOptions): {
  prompt_cache_key?: string;
  reasoning?: { effort: "low" | "medium" | "high" };
} {
  const extras: {
    prompt_cache_key?: string;
    reasoning?: { effort: "low" | "medium" | "high" };
  } = {};

  if (isGpt56Family(opts.model)) {
    extras.prompt_cache_key = buildPromptCacheKey(
      opts.projectId,
      opts.role,
      opts.config
    );
    if (opts.includeReasoning !== false) {
      const effort = getReasoningEffortForRole(opts.role);
      if (effort) extras.reasoning = { effort };
    }
  }

  return extras;
}

/** Best-effort extract of Responses API usage fields (incl. cache_write when present). */
export function extractResponseUsage(response: {
  id?: string | null;
  usage?: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    input_tokens_details?: {
      cached_tokens?: number | null;
      cache_write_tokens?: number | null;
      cache_creation_tokens?: number | null;
    } | null;
  } | null;
}): {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  requestId?: string;
} {
  const usage = response.usage;
  const details = usage?.input_tokens_details;
  const cacheWrite =
    details?.cache_write_tokens ?? details?.cache_creation_tokens ?? 0;
  return {
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens: details?.cached_tokens ?? 0,
    cacheWriteTokens: cacheWrite ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    requestId: response.id ?? undefined,
  };
}
