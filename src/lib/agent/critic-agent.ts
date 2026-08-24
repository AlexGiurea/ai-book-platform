import { zodTextFormat } from "openai/helpers/zod";
import {
  buildResponsesCallExtras,
  extractResponseUsage,
  getModelForProject,
  getOpenAIClient,
  getProjectPipelineConfig,
} from "./openai-client";
import { store } from "./context-store";
import { asTruncation } from "./response-guard";
import { toGenerationCancelled } from "./generation-errors";
import { CritiqueOutputSchema, type CritiqueOutputParsed } from "./schemas";
import { buildCriticSystemPrompt, buildCriticUserPrompt } from "./prompts";
import { stripEmDashes } from "./sanitize";
import {
  rebuildStoryStateBeforeBatch,
  rebuildStoryStateFromDeltas,
} from "./story-state";
import type { StoryState } from "./types";

/**
 * Ceiling covering reasoning tokens AND visible output. Sized with headroom for
 * reasoning: a budget that fits only the output truncates the JSON mid-string.
 * This is a ceiling, not spend — only tokens actually generated are billed.
 */
const CRITIC_MAX_OUTPUT_TOKENS = 8000;

function serializeStoryStateCompact(state: StoryState | undefined): string {
  if (!state) return "(empty)";
  const facts = state.facts?.length ? state.facts.join("; ") : "(none)";
  const chars = state.characters?.length
    ? state.characters.map((c) => `${c.name}: ${c.status}`).join("; ")
    : "(none)";
  const threads = state.openThreads?.length
    ? state.openThreads.map((t) => `${t.id}: ${t.description}`).join("; ")
    : "(none)";
  return `Facts: ${facts}\nCharacters: ${chars}\nOpen threads: ${threads}`;
}

export function normalizeCriticBatchNumber(
  reported: number,
  allowedBatchNumbers: number[]
): number {
  if (allowedBatchNumbers.includes(reported)) return reported;
  return allowedBatchNumbers.at(-1) ?? reported;
}

export class CriticAgent {
  async critiqueChapter(
    projectId: string,
    chapterNumber: number
  ): Promise<CritiqueOutputParsed> {
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);

    const chapterPlan = project.bible.chapters.find((c) => c.number === chapterNumber);
    if (!chapterPlan) {
      throw new Error(`Chapter ${chapterNumber} not found in bible`);
    }

    const chapterBlueprints = project.bible.batches.filter(
      (b) => b.chapterNumber === chapterNumber
    );
    const chapterBatches = project.batches.filter(
      (b) => b.chapterNumber === chapterNumber
    );
    const allowedBatchNumbers = chapterBatches.map((b) => b.batchNumber);
    const firstBatch = Math.min(...allowedBatchNumbers);
    const lastBatch = Math.max(...allowedBatchNumbers);

    const batchSources = project.batches.map((b) => ({
      batchNumber: b.batchNumber,
      stateDelta: b.stateDelta,
    }));
    const stateBefore = rebuildStoryStateBeforeBatch(batchSources, firstBatch);
    const stateAfter = rebuildStoryStateFromDeltas(
      batchSources.filter((b) => b.batchNumber <= lastBatch)
    );

    const batchSummaries = chapterBatches.map((b) => ({
      batchNumber: b.batchNumber,
      summary: b.chapterSummary ?? "(no summary)",
    }));
    const chapterProse = chapterBatches.map((b) => b.prose).join("\n\n");

    const client = getOpenAIClient();
    const model = getModelForProject(project, "critic");
    const config = getProjectPipelineConfig(project);
    const instructions = buildCriticSystemPrompt();
    const input = buildCriticUserPrompt({
      chapterPlan: {
        number: chapterPlan.number,
        title: chapterPlan.title,
        summary: chapterPlan.summary,
        arcPurpose: chapterPlan.arcPurpose,
        openingHook: chapterPlan.openingHook,
        closingBeat: chapterPlan.closingBeat,
      },
      blueprints: chapterBlueprints.map((b) => ({
        number: b.number,
        purpose: b.purpose,
        scenes: b.scenes,
        continuityFlags: b.continuityFlags,
      })),
      batchSummaries,
      allowedBatchNumbers,
      storyStateBeforeText: serializeStoryStateCompact(stateBefore),
      storyStateAfterText: serializeStoryStateCompact(stateAfter),
      chapterProse,
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const started = Date.now();
    const extras = buildResponsesCallExtras({
      projectId,
      role: "critic",
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
          max_output_tokens: CRITIC_MAX_OUTPUT_TOKENS,
          ...extras,
          text: {
            format: zodTextFormat(CritiqueOutputSchema, "chapter_critique"),
          },
        },
        genSignal ? { signal: genSignal } : undefined
      );
    } catch (err) {
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw asTruncation(err, "critic", CRITIC_MAX_OUTPUT_TOKENS);
    }
    const durationMs = Date.now() - started;

    await store.recordLlmUsage(projectId, "critic", model, {
      ...extractResponseUsage(response),
      operation: "critique",
      durationMs,
    });

    const parsed = response.output_parsed;
    if (!parsed) throw new Error(`Critic returned no parsed output (chapter ${chapterNumber})`);

    const hasHigh = parsed.issues.some((i) => i.severity === "high");
    const hasMissedBeats = parsed.beatsMissed.length > 0;
    const verdict: "pass" | "revise" =
      parsed.verdict === "revise" && (hasHigh || hasMissedBeats) ? "revise" : "pass";

    const cleaned: CritiqueOutputParsed = {
      issues: parsed.issues.map((i) => ({
        description: stripEmDashes(i.description),
        severity: i.severity,
        batchNumber: normalizeCriticBatchNumber(
          i.batchNumber,
          allowedBatchNumbers
        ),
      })),
      beatsMissed: parsed.beatsMissed.map(stripEmDashes),
      verdict,
    };

    await store.appendEvent(projectId, {
      type: "chapter_critique",
      chapterNumber,
      verdict: cleaned.verdict,
      issueCount: cleaned.issues.length,
      durationMs,
      model,
    });

    return cleaned;
  }
}

export const criticAgent = new CriticAgent();
