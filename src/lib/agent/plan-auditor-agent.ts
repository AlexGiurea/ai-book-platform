import { zodTextFormat } from "openai/helpers/zod";
import {
  buildResponsesCallExtras,
  extractResponseUsage,
  getModelForProject,
  getOpenAIClient,
  getProjectPipelineConfig,
} from "./openai-client";
import { store } from "./context-store";
import { toGenerationCancelled } from "./generation-errors";
import {
  PlanAuditOutputSchema,
  type PlanAuditOutputParsed,
} from "./schemas";
import { buildPlanAuditorSystemPrompt, buildPlanAuditorUserPrompt } from "./prompts";
import { stripEmDashes } from "./sanitize";

const AUDITOR_MAX_OUTPUT_TOKENS = 2500;

export class PlanAuditorAgent {
  async auditPlan(projectId: string): Promise<PlanAuditOutputParsed> {
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);

    const client = getOpenAIClient();
    const model = getModelForProject(project, "plan_auditor");
    const config = getProjectPipelineConfig(project);
    const instructions = buildPlanAuditorSystemPrompt();
    const input = buildPlanAuditorUserPrompt({
      bible: project.bible,
      targetWords: project.targetWords,
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const started = Date.now();
    const extras = buildResponsesCallExtras({
      projectId,
      role: "plan_auditor",
      model,
      config,
    });

    let response;
    try {
      response = await client.responses.parse(
        {
          model,
          instructions,
          input,
          max_output_tokens: AUDITOR_MAX_OUTPUT_TOKENS,
          ...extras,
          text: {
            format: zodTextFormat(PlanAuditOutputSchema, "plan_audit"),
          },
        },
        genSignal ? { signal: genSignal } : undefined
      );
    } catch (err) {
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw err;
    }
    const durationMs = Date.now() - started;

    await store.recordLlmUsage(projectId, "plan_auditor", model, {
      ...extractResponseUsage(response),
      operation: "plan_audit",
      durationMs,
    });

    const parsed = response.output_parsed;
    if (!parsed) throw new Error("Plan auditor returned no parsed output");

    // Only high-severity structural/canon defects cause repair.
    const highIssues = parsed.issues.filter((i) => i.severity === "high");
    const verdict: "pass" | "repair" =
      parsed.verdict === "repair" && highIssues.length > 0 ? "repair" : "pass";

    const cleaned: PlanAuditOutputParsed = {
      issues: parsed.issues.map((i) => ({
        ...i,
        repairInstruction: stripEmDashes(i.repairInstruction),
      })),
      verdict,
      summary: stripEmDashes(parsed.summary),
    };

    await store.appendEvent(projectId, {
      type: "plan_audit",
      verdict: cleaned.verdict,
      issueCount: cleaned.issues.length,
      durationMs,
      model,
    });

    return cleaned;
  }
}

export const planAuditorAgent = new PlanAuditorAgent();
