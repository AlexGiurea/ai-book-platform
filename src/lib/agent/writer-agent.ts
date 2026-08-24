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
import { BatchOutputSchema, ChapterOutputSchema } from "./schemas";
import {
  buildChapterWriterUserPrompt,
  buildWriterSystemPrompt,
  buildWriterUserPrompt,
} from "./prompts";
import { stripEmDashes } from "./sanitize";
import {
  normalizeStateDelta,
  rebuildStoryStateBeforeBatch,
} from "./story-state";
import { readContextTokenBudget, selectManuscriptWindow } from "./writer-context";
import { computeLengthGuidance } from "./length-guidance";
import {
  chapterTargetWords,
  pendingChapterBlueprints,
} from "./write-granularity";
import type { BatchBlueprint, StateDelta, StoryBible } from "./types";

/**
 * Ceiling covering reasoning tokens AND visible output. Sized with headroom for
 * reasoning: a budget that fits only the output truncates the JSON mid-string.
 * This is a ceiling, not spend — only tokens actually generated are billed.
 */
const WRITER_MAX_OUTPUT_TOKENS = 12000;

/** Chapter mode emits ~3x the prose of a batch, plus metadata and reasoning. */
const CHAPTER_MAX_OUTPUT_TOKENS = 32000;

export interface ChapterWriteResult {
  batchesWritten: number;
  wordsInChapter: number;
  durationMs: number;
  skipped?: boolean;
  /** Chapter is half-written; caller must fall back to per-batch writes. */
  needsBatchFallback?: boolean;
}

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

    // The whole manuscript so far. Note this does NOT cache: only `instructions`
    // participates in prompt caching, and only when byte-identical, so the
    // manuscript is re-read at full price every call. That is the measured price
    // of full-manuscript continuity. Truncation only engages past the token
    // budget, which no current length preset hits.
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

    const instructions = buildWriterSystemPrompt({ bible, idea: project.input.idea });
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

  /**
   * Write an entire chapter in one model call.
   *
   * The economic reason is that the manuscript is re-sent in full on every
   * writer call and cannot be cached, so redundant input scales with the number
   * of calls rather than their size. Three batches in one call re-read the
   * manuscript once instead of three times.
   *
   * The model returns each section separately, keyed by absolute batch number,
   * so everything downstream — critique, revision, book repair — stays
   * batch-scoped and unchanged.
   */
  async writeChapter(
    projectId: string,
    chapterNumber: number
  ): Promise<ChapterWriteResult> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.bible) throw new Error("Project has no book blueprint — plan first");

    const bible: StoryBible = project.bible;
    const config = getProjectPipelineConfig(project);
    const model = getModelForProject(project, "writer");
    const client = getOpenAIClient();

    const written = project.batches.map((b) => b.batchNumber);
    const { blueprints, partiallyWritten } = pendingChapterBlueprints(
      bible,
      chapterNumber,
      written
    );

    if (!blueprints.length) {
      // Whole chapter already exists; nothing to do.
      await store.rebuildStoryState(projectId);
      return { batchesWritten: 0, wordsInChapter: 0, durationMs: 0, skipped: true };
    }
    if (partiallyWritten) {
      // A resumed or partially failed chapter. Writing it as a unit would
      // clobber existing rows, so the caller must fall back to per-batch.
      return {
        batchesWritten: 0,
        wordsInChapter: 0,
        durationMs: 0,
        skipped: true,
        needsBatchFallback: true,
      };
    }

    const firstBatch = blueprints[0].number;
    const priorBatches = project.batches
      .filter((b) => b.batchNumber < firstBatch)
      .sort((a, b) => a.batchNumber - b.batchNumber);

    const manuscript = selectManuscriptWindow(priorBatches, readContextTokenBudget());
    const storyState = rebuildStoryStateBeforeBatch(
      project.batches.map((b) => ({ batchNumber: b.batchNumber, stateDelta: b.stateDelta })),
      firstBatch
    );

    const wordsSoFar = priorBatches.reduce((sum, b) => sum + b.wordCount, 0);
    // Drift correction is computed on the chapter's first batch, then applied to
    // the chapter's whole budget so a short book is corrected at chapter scale.
    const guidance = computeLengthGuidance({
      blueprintTargetWords: blueprints[0].targetWords,
      batchNumber: firstBatch,
      totalBatches: bible.totalBatches,
      wordsSoFar,
      bookTargetWords: project.targetWords,
    });
    const planned = chapterTargetWords(blueprints);
    const scale = blueprints[0].targetWords
      ? guidance.targetWords / blueprints[0].targetWords
      : 1;
    const chapterTarget = Math.round(planned * scale);

    const chapterPlan = bible.chapters.find((c) => c.number === chapterNumber);
    const isFinalChapter =
      blueprints.at(-1)!.number >= bible.totalBatches;

    await store.appendEvent(projectId, {
      type: "batch_start",
      batchNumber: firstBatch,
      chapterNumber,
      totalWords: project.totalWords,
      model,
    });

    const instructions = buildWriterSystemPrompt({ bible, idea: project.input.idea });
    const input = buildChapterWriterUserPrompt({
      bible,
      chapterNumber,
      chapterTitle: chapterPlan?.title ?? blueprints[0].chapterTitle,
      blueprints,
      manuscriptBatches: manuscript.fullProse,
      summarizedBatches: manuscript.summarized,
      storyState,
      isFinalChapter,
      totalWords: project.totalWords,
      targetWords: project.targetWords,
      chapterTargetWords: chapterTarget,
      chapterMinWords: Math.round(chapterTarget * 0.9),
      chapterMaxWords: Math.round(chapterTarget * 1.1),
      lengthCorrection: guidance.correction,
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const started = Date.now();
    const extras = buildResponsesCallExtras({ projectId, role: "writer", model, config });

    let response;
    try {
      response = await client.responses.parse(
        {
          model,
          instructions,
          input,
          max_output_tokens: CHAPTER_MAX_OUTPUT_TOKENS,
          ...extras,
          text: { format: zodTextFormat(ChapterOutputSchema, "chapter_output") },
        },
        genSignal ? { signal: genSignal } : undefined
      );
    } catch (err) {
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw asTruncation(err, "writer(chapter)", CHAPTER_MAX_OUTPUT_TOKENS);
    }
    const durationMs = Date.now() - started;

    const usage = extractResponseUsage(response);
    await store.recordLlmUsage(projectId, "writer", model, {
      ...usage,
      operation: "write_chapter",
      durationMs,
      requestId: usage.requestId,
    });

    const parsed = response.output_parsed;
    if (!parsed) throw new Error(`Writer returned no parsed output (chapter ${chapterNumber})`);

    const expected = new Set(blueprints.map((b) => b.number));
    const returned = [...parsed.batches].sort((a, b) => a.batchNumber - b.batchNumber);

    let batchesWritten = 0;
    let wordsInChapter = 0;

    for (const section of returned) {
      if (!expected.has(section.batchNumber)) {
        console.warn("[writer] chapter call returned an unexpected batch number", {
          projectId,
          chapterNumber,
          got: section.batchNumber,
          expected: [...expected],
        });
        continue;
      }
      const blueprint = blueprints.find((b) => b.number === section.batchNumber)!;
      const stateDelta =
        normalizeStateDelta(
          {
            newFacts: (section.stateDelta?.newFacts ?? []).map(stripEmDashes),
            characterUpdates: (section.stateDelta?.characterUpdates ?? []).map((u) => ({
              name: stripEmDashes(u.name),
              status: stripEmDashes(u.status),
            })),
            threadsOpened: (section.stateDelta?.threadsOpened ?? []).map((t) => ({
              id: stripEmDashes(t.id),
              description: stripEmDashes(t.description),
            })),
            threadsResolved: (section.stateDelta?.threadsResolved ?? []).map((t) => ({
              id: stripEmDashes(t.id),
            })),
          },
          section.batchNumber
        ) ?? { newFacts: [], characterUpdates: [], threadsOpened: [], threadsResolved: [] };

      const result = await store.appendBatch(projectId, {
        batchNumber: section.batchNumber,
        prose: stripEmDashes(section.prose),
        chapterNumber: blueprint.chapterNumber,
        chapterTitle: blueprint.chapterTitle,
        chapterSummary: stripEmDashes(section.summary),
        openThreads: stripEmDashes(section.openThreads),
        stateDelta,
      });
      if (result?.inserted) {
        batchesWritten++;
        wordsInChapter += result.batch?.wordCount ?? 0;
      }
    }

    const missing = [...expected].filter(
      (n) => !returned.some((r) => r.batchNumber === n)
    );
    if (missing.length) {
      // Leave the gap for the per-batch path to fill rather than failing the
      // project — the queue will pick the missing numbers up as normal writes.
      console.warn("[writer] chapter call omitted batches", {
        projectId,
        chapterNumber,
        missing,
      });
    }

    await store.rebuildStoryState(projectId);
    const updated = await store.getProject(projectId);
    await store.appendEvent(projectId, {
      type: "batch_complete",
      batchNumber: blueprints.at(-1)!.number,
      chapterNumber,
      wordsInBatch: wordsInChapter,
      totalWords: updated?.totalWords ?? 0,
      durationMs,
      model,
    });

    return { batchesWritten, wordsInChapter, durationMs, skipped: batchesWritten === 0 };
  }
}

export const writerAgent = new WriterAgent();
