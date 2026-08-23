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
  RevisionVerifierOutputSchema,
  type RevisionVerifierOutputParsed,
} from "./schemas";
import {
  buildRevisionVerifierSystemPrompt,
  buildRevisionVerifierUserPrompt,
} from "./prompts";
import { stripEmDashes } from "./sanitize";
import {
  rebuildStoryStateBeforeBatch,
  rebuildStoryStateFromDeltas,
} from "./story-state";
import type { VerifyRevisionPayload } from "./types";

const VERIFIER_MAX_OUTPUT_TOKENS = 1200;

export class RevisionVerifierAgent {
  async verify(
    projectId: string,
    payload: VerifyRevisionPayload
  ): Promise<RevisionVerifierOutputParsed> {
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);

    const batch = project.batches.find((b) => b.batchNumber === payload.batchNumber);
    if (!batch) {
      // Soft-pass if batch missing
      const soft: RevisionVerifierOutputParsed = {
        fixed: true,
        remainingIssues: [],
        notes: "Batch missing; treating as fixed",
      };
      await store.appendEvent(projectId, {
        type: "revision_verified",
        batchNumber: payload.batchNumber,
        chapterNumber: payload.chapterNumber,
        verdict: "pass",
        fixed: true,
      });
      return soft;
    }

    const stateSources = project.batches.map((b) => ({
        batchNumber: b.batchNumber,
        stateDelta: b.stateDelta,
      }));
    const stateBefore = rebuildStoryStateBeforeBatch(
      stateSources,
      payload.batchNumber
    );
    const stateThroughRevision = rebuildStoryStateFromDeltas(
      stateSources.filter((item) => item.batchNumber <= payload.batchNumber)
    );

    const client = getOpenAIClient();
    const model = getModelForProject(project, "revision_verifier");
    const config = getProjectPipelineConfig(project);
    const instructions = buildRevisionVerifierSystemPrompt();
    const input = buildRevisionVerifierUserPrompt({
      batchNumber: payload.batchNumber,
      chapterNumber: payload.chapterNumber,
      issues: payload.issues,
      beatsMissed: payload.beatsMissed,
      summary: batch.chapterSummary ?? "(no summary)",
      revisedProse: batch.prose,
      storyStateBeforeText: JSON.stringify(stateBefore),
      storyStateAfterText: JSON.stringify(stateThroughRevision),
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const started = Date.now();
    const extras = buildResponsesCallExtras({
      projectId,
      role: "revision_verifier",
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
          max_output_tokens: VERIFIER_MAX_OUTPUT_TOKENS,
          ...extras,
          text: {
            format: zodTextFormat(
              RevisionVerifierOutputSchema,
              "revision_verify"
            ),
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

    await store.recordLlmUsage(projectId, "revision_verifier", model, {
      ...extractResponseUsage(response),
      operation: "verify_revision",
      durationMs,
    });

    const parsed = response.output_parsed;
    if (!parsed) throw new Error("Revision verifier returned no parsed output");

    const cleaned: RevisionVerifierOutputParsed = {
      fixed: parsed.fixed,
      remainingIssues: parsed.remainingIssues.map(stripEmDashes),
      notes: parsed.notes ? stripEmDashes(parsed.notes) : null,
    };

    // A false verdict may trigger exactly one more revision; the composer caps it.
    await store.appendEvent(projectId, {
      type: "revision_verified",
      batchNumber: payload.batchNumber,
      chapterNumber: payload.chapterNumber,
      verdict: cleaned.fixed ? "pass" : "warning",
      fixed: cleaned.fixed,
      issueCount: cleaned.remainingIssues.length,
      durationMs,
      model,
    });

    return cleaned;
  }
}

export const revisionVerifierAgent = new RevisionVerifierAgent();
