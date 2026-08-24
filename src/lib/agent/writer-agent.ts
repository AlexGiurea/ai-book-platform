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
import { BatchOutputSchema } from "./schemas";
import { buildWriterSystemPrompt, buildWriterUserPrompt } from "./prompts";
import { stripEmDashes } from "./sanitize";
import {
  normalizeStateDelta,
  rebuildStoryStateBeforeBatch,
} from "./story-state";
import { readContextTokenBudget, selectManuscriptWindow } from "./writer-context";
import { computeLengthGuidance } from "./length-guidance";
import type { BatchBlueprint, StateDelta, StoryBible } from "./types";

/** Room for ~2,800 words + metadata + reasoning on GPT-5.6. */
/**
 * Ceiling covering reasoning tokens AND visible output. Sized with headroom for
 * reasoning: a budget that fits only the output truncates the JSON mid-string.
 * This is a ceiling, not spend — only tokens actually generated are billed.
 */
const WRITER_MAX_OUTPUT_TOKENS = 12000;

export interface BatchWriteResult {
  wordsInBatch: number;
  openThreads: string;
  stateDelta: StateDelta;
  durationMs: number;
  skipped?: boolean;
}

export class WriterAgent {
  async writeBatch(
    projectId: string,
    blueprint: BatchBlueprint,
    options: {
      critiqueFixes?: string;
      replaceBatchNumber?: number;
      revisionKey?: string;
    } = {}
  ): Promise<BatchWriteResult> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.bible) throw new Error("Project has no book blueprint — plan first");

    const bible: StoryBible = project.bible;
    const config = getProjectPipelineConfig(project);
    const role = options.replaceBatchNumber != null ? "revise" : "writer";
    const model = getModelForProject(project, role);
    const client = getOpenAIClient();

    // Idempotent write: if absolute batch already exists and this is not a revise, skip model.
    if (options.replaceBatchNumber == null) {
      const existing = project.batches.find((b) => b.batchNumber === blueprint.number);
      if (existing) {
        await store.rebuildStoryState(projectId);
        return {
          wordsInBatch: existing.wordCount,
          openThreads: existing.openThreads ?? "",
          stateDelta: existing.stateDelta ?? {
            newFacts: [],
            characterUpdates: [],
            threadsOpened: [],
            threadsResolved: [],
          },
          durationMs: 0,
          skipped: true,
        };
      }
    }

    // Idempotent revise: matching revision key already applied.
    if (options.replaceBatchNumber != null && options.revisionKey) {
      const existing = project.batches.find(
        (b) => b.batchNumber === options.replaceBatchNumber
      );
      if (existing?.lastRevisionKey === options.revisionKey) {
        await store.rebuildStoryState(projectId);
        return {
          wordsInBatch: existing.wordCount,
          openThreads: existing.openThreads ?? "",
          stateDelta: existing.stateDelta ?? {
            newFacts: [],
            characterUpdates: [],
            threadsOpened: [],
            threadsResolved: [],
          },
          durationMs: 0,
          skipped: true,
        };
      }
    }

    // Context: only batches strictly before the target batch number.
    const targetNumber =
      options.replaceBatchNumber != null
        ? options.replaceBatchNumber
        : blueprint.number;
    const priorBatches = project.batches
      .filter((b) => b.batchNumber < targetNumber)
      .sort((a, b) => a.batchNumber - b.batchNumber);

    // The whole manuscript so far, as an append-only cache prefix. Truncation
    // only engages past the token budget, which no current length preset hits.
    const manuscript = selectManuscriptWindow(
      priorBatches,
      readContextTokenBudget()
    );
    if (manuscript.mode === "truncated") {
      console.warn("[writer] manuscript context truncated", {
        projectId,
        batchNumber: targetNumber,
        droppedBatches: manuscript.summarized.length,
        estimatedTokens: manuscript.estimatedTokens,
      });
    }

    // Story state immediately before this batch (from deltas, not live merge).
    const storyState = rebuildStoryStateBeforeBatch(
      project.batches.map((b) => ({
        batchNumber: b.batchNumber,
        stateDelta: b.stateDelta,
      })),
      targetNumber
    );

    const isFinalBatch = blueprint.number >= bible.totalBatches;

    // Words already banked, excluding the batch being written or replaced.
    const wordsSoFar = priorBatches.reduce((sum, b) => sum + b.wordCount, 0);
    const length = computeLengthGuidance({
      blueprintTargetWords: blueprint.targetWords,
      batchNumber: targetNumber,
      totalBatches: bible.totalBatches,
      wordsSoFar,
      bookTargetWords: project.targetWords,
    });

    if (options.replaceBatchNumber == null) {
      await store.appendEvent(projectId, {
        type: "batch_start",
        batchNumber: blueprint.number,
        totalWords: project.totalWords,
        model,
      });
    }

    const instructions = buildWriterSystemPrompt();
    const input = buildWriterUserPrompt({
      input: project.input,
      bible,
      blueprint,
      manuscriptBatches: manuscript.fullProse,
      summarizedBatches: manuscript.summarized,
      storyState,
      isFinalBatch,
      totalWords: project.totalWords,
      targetWords: project.targetWords,
      length,
      critiqueFixes: options.critiqueFixes,
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const started = Date.now();
    const extras = buildResponsesCallExtras({
      projectId,
      role,
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
          max_output_tokens: WRITER_MAX_OUTPUT_TOKENS,
          ...extras,
          text: {
            format: zodTextFormat(BatchOutputSchema, "batch_output"),
          },
        },
        genSignal ? { signal: genSignal } : undefined
      );
    } catch (err) {
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw asTruncation(err, "writer", WRITER_MAX_OUTPUT_TOKENS);
    }
    const durationMs = Date.now() - started;

    const usage = extractResponseUsage(response);
    await store.recordLlmUsage(projectId, role, model, {
      ...usage,
      operation: options.replaceBatchNumber != null ? "revise" : "write",
      durationMs,
      requestId: usage.requestId,
    });

    const parsed = response.output_parsed;
    if (!parsed) throw new Error(`Writer returned no parsed output (batch ${blueprint.number})`);

    const cleanProse = stripEmDashes(parsed.prose);
    const cleanSummary = stripEmDashes(parsed.summary);
    const cleanOpenThreads = stripEmDashes(parsed.openThreads);
    const stateDelta =
      normalizeStateDelta(
        {
          newFacts: (parsed.stateDelta?.newFacts ?? []).map(stripEmDashes),
          characterUpdates: (parsed.stateDelta?.characterUpdates ?? []).map((u) => ({
            name: stripEmDashes(u.name),
            status: stripEmDashes(u.status),
          })),
          threadsOpened: (parsed.stateDelta?.threadsOpened ?? []).map((t) => ({
            id: stripEmDashes(t.id),
            description: stripEmDashes(t.description),
          })),
          threadsResolved: (parsed.stateDelta?.threadsResolved ?? []).map((t) => ({
            id: stripEmDashes(t.id),
          })),
        },
        targetNumber
      ) ?? {
        newFacts: [],
        characterUpdates: [],
        threadsOpened: [],
        threadsResolved: [],
      };

    let appended;
    let applied = true;
    if (options.replaceBatchNumber != null) {
      const result = await store.replaceBatch(projectId, options.replaceBatchNumber, {
        prose: cleanProse,
        chapterSummary: cleanSummary,
        openThreads: cleanOpenThreads,
        stateDelta,
        revisionKey: options.revisionKey,
      });
      appended = result?.batch;
      applied = result?.applied ?? false;
    } else {
      const result = await store.appendBatch(projectId, {
        batchNumber: blueprint.number,
        prose: cleanProse,
        chapterNumber: blueprint.chapterNumber,
        chapterTitle: blueprint.chapterTitle,
        chapterSummary: cleanSummary,
        openThreads: cleanOpenThreads,
        stateDelta,
      });
      appended = result?.batch;
      applied = result?.inserted ?? false;
    }

    await store.rebuildStoryState(projectId);

    const updated = await store.getProject(projectId);
    if (options.replaceBatchNumber != null) {
      if (applied) {
        await store.appendEvent(projectId, {
          type: "batch_revised",
          batchNumber: blueprint.number,
          chapterNumber: blueprint.chapterNumber,
          wordsInBatch: appended?.wordCount ?? 0,
          totalWords: updated?.totalWords ?? 0,
          durationMs,
          model,
        });
      }
    } else if (applied) {
      await store.appendEvent(projectId, {
        type: "batch_complete",
        batchNumber: blueprint.number,
        wordsInBatch: appended?.wordCount ?? 0,
        totalWords: updated?.totalWords ?? 0,
        durationMs,
        model,
      });
    }

    return {
      wordsInBatch: appended?.wordCount ?? 0,
      openThreads: cleanOpenThreads,
      stateDelta,
      durationMs,
      skipped: !applied,
    };
  }
}

export const writerAgent = new WriterAgent();
