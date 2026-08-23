import {
  FALLBACK_PROJECT_PLAN,
  normalizePlan,
  type SubscriptionPlan,
} from "@/lib/plans";

/** Pipeline version stamped on every new project. */
export const PIPELINE_VERSION = "v3" as const;

export type LlmRole =
  | "planner"
  | "plan_auditor"
  | "writer"
  | "critic"
  | "revise"
  | "revision_verifier";

export type ReasoningEffortLevel = "low" | "medium" | "high";

/** Default role models — Literary Pro route (writer/reviser Sol). */
export const DEFAULT_ROLE_MODELS = {
  planner: "gpt-5.6-sol",
  plan_auditor: "gpt-5.6-terra",
  writer_free: "gpt-5.6-luna",
  writer_pro: "gpt-5.6-sol",
  critic: "gpt-5.6-terra",
  revise_free: "gpt-5.6-luna",
  revise_pro: "gpt-5.6-sol",
  revision_verifier: "gpt-5.6-luna",
  cover: "gpt-image-2",
} as const;

/** Reasoning defaults when the Responses API accepts `reasoning.effort`. */
export const DEFAULT_REASONING_EFFORT: Record<LlmRole, ReasoningEffortLevel> = {
  planner: "high",
  plan_auditor: "medium",
  writer: "low",
  critic: "medium",
  revise: "medium",
  revision_verifier: "low",
};

export interface ProjectModelConfig {
  planner: string;
  plan_auditor: string;
  writer: string;
  critic: string;
  revise: string;
  revision_verifier: string;
  cover: string;
}

export interface ProjectPipelineConfig {
  pipelineVersion: typeof PIPELINE_VERSION | string;
  models: ProjectModelConfig;
  /** Optional fingerprint so cache keys stay stable if models change mid-deploy for new projects only. */
  configHash: string;
}

/**
 * Trim env values; treat missing, "", and whitespace-only as undefined.
 * Fixes blank Vercel env vars that would otherwise override defaults via `??`.
 */
export function readEnvModel(name: string): string | undefined {
  const raw = process.env[name];
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireNonEmpty(id: string, label: string): string {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error(`Model config invalid: ${label} must be a non-empty string`);
  }
  return trimmed;
}

/** Resolve live env defaults for a subscription plan (used only when snapshotting). */
export function resolveLiveModelConfig(
  plan: SubscriptionPlan = FALLBACK_PROJECT_PLAN
): ProjectModelConfig {
  const normalized = normalizePlan(plan);

  const planner = requireNonEmpty(
    readEnvModel("OPENAI_PLANNER_MODEL") ?? DEFAULT_ROLE_MODELS.planner,
    "planner"
  );
  const plan_auditor = requireNonEmpty(
    readEnvModel("OPENAI_PLAN_AUDITOR_MODEL") ?? DEFAULT_ROLE_MODELS.plan_auditor,
    "plan_auditor"
  );
  const critic = requireNonEmpty(
    readEnvModel("OPENAI_CRITIC_MODEL") ?? DEFAULT_ROLE_MODELS.critic,
    "critic"
  );
  const revision_verifier = requireNonEmpty(
    readEnvModel("OPENAI_REVISION_VERIFIER_MODEL") ??
      DEFAULT_ROLE_MODELS.revision_verifier,
    "revision_verifier"
  );
  const cover = requireNonEmpty(
    readEnvModel("OPENAI_IMAGE_MODEL") ?? DEFAULT_ROLE_MODELS.cover,
    "cover"
  );

  const writer =
    normalized === "free"
      ? requireNonEmpty(
          readEnvModel("OPENAI_WRITER_MODEL_FREE") ??
            readEnvModel("OPENAI_FREE_MODEL") ??
            DEFAULT_ROLE_MODELS.writer_free,
          "writer"
        )
      : requireNonEmpty(
          readEnvModel("OPENAI_WRITER_MODEL_PRO") ??
            readEnvModel("OPENAI_PRO_MODEL") ??
            readEnvModel("OPENAI_MODEL") ??
            DEFAULT_ROLE_MODELS.writer_pro,
          "writer"
        );

  const revise =
    normalized === "free"
      ? requireNonEmpty(
          readEnvModel("OPENAI_REVISE_MODEL_FREE") ??
            readEnvModel("OPENAI_WRITER_MODEL_FREE") ??
            readEnvModel("OPENAI_FREE_MODEL") ??
            DEFAULT_ROLE_MODELS.revise_free,
          "revise"
        )
      : requireNonEmpty(
          readEnvModel("OPENAI_REVISE_MODEL_PRO") ??
            // Pro revise defaults to Sol even if writer is overridden to Terra (Balanced).
            DEFAULT_ROLE_MODELS.revise_pro,
          "revise"
        );

  return {
    planner,
    plan_auditor,
    writer,
    critic,
    revise,
    revision_verifier,
    cover,
  };
}

export function hashModelConfig(models: ProjectModelConfig): string {
  const payload = [
    models.planner,
    models.plan_auditor,
    models.writer,
    models.critic,
    models.revise,
    models.revision_verifier,
    models.cover,
  ].join("|");
  let h = 2166136261;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function createPipelineConfig(
  plan: SubscriptionPlan = FALLBACK_PROJECT_PLAN
): ProjectPipelineConfig {
  const models = resolveLiveModelConfig(plan);
  return {
    pipelineVersion: PIPELINE_VERSION,
    models,
    configHash: hashModelConfig(models),
  };
}

/**
 * Normalize stored or missing pipeline config for old rows.
 * Deterministic from plan + current env when missing (does not crash).
 */
export function normalizePipelineConfig(
  raw: unknown,
  plan: SubscriptionPlan = FALLBACK_PROJECT_PLAN
): ProjectPipelineConfig {
  if (raw && typeof raw === "object") {
    const obj = raw as Partial<ProjectPipelineConfig> & {
      models?: Partial<ProjectModelConfig>;
    };
    const live = resolveLiveModelConfig(plan);
    const models: ProjectModelConfig = {
      planner: requireNonEmpty(obj.models?.planner ?? live.planner, "planner"),
      plan_auditor: requireNonEmpty(
        obj.models?.plan_auditor ?? live.plan_auditor,
        "plan_auditor"
      ),
      writer: requireNonEmpty(obj.models?.writer ?? live.writer, "writer"),
      critic: requireNonEmpty(obj.models?.critic ?? live.critic, "critic"),
      revise: requireNonEmpty(obj.models?.revise ?? live.revise, "revise"),
      revision_verifier: requireNonEmpty(
        obj.models?.revision_verifier ?? live.revision_verifier,
        "revision_verifier"
      ),
      cover: requireNonEmpty(obj.models?.cover ?? live.cover, "cover"),
    };
    return {
      pipelineVersion:
        typeof obj.pipelineVersion === "string" && obj.pipelineVersion.trim()
          ? obj.pipelineVersion.trim()
          : PIPELINE_VERSION,
      models,
      configHash:
        typeof obj.configHash === "string" && obj.configHash.trim()
          ? obj.configHash.trim()
          : hashModelConfig(models),
    };
  }
  return createPipelineConfig(plan);
}

/** Resolve a role model from a project snapshot (never re-reads env for generation). */
export function getModelFromConfig(
  config: ProjectPipelineConfig,
  role: LlmRole
): string {
  switch (role) {
    case "planner":
      return config.models.planner;
    case "plan_auditor":
      return config.models.plan_auditor;
    case "writer":
      return config.models.writer;
    case "critic":
      return config.models.critic;
    case "revise":
      return config.models.revise;
    case "revision_verifier":
      return config.models.revision_verifier;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

export function getImageModelFromConfig(config: ProjectPipelineConfig): string {
  return config.models.cover;
}

/** Stable prompt cache key scoped by project + role + pipeline/model fingerprint. */
export function buildPromptCacheKey(
  projectId: string,
  role: LlmRole,
  config: ProjectPipelineConfig
): string {
  return `folio:${config.pipelineVersion}:${config.configHash}:${role}:${projectId}`;
}

export function isGpt56Family(model: string): boolean {
  return /gpt-5\.6/i.test(model);
}

export function getReasoningEffortForRole(
  role: LlmRole
): ReasoningEffortLevel | undefined {
  return DEFAULT_REASONING_EFFORT[role];
}

/** Validate that all default / live model IDs are non-empty (no network). */
export function validateModelConfigAtStartup(): void {
  createPipelineConfig("free");
  createPipelineConfig("pro");
}

// Run once on module load in server contexts.
try {
  validateModelConfigAtStartup();
} catch (err) {
  console.warn(
    "[model-config] startup validation failed:",
    err instanceof Error ? err.message : String(err)
  );
}
