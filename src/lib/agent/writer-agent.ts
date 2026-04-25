import { zodTextFormat } from "openai/helpers/zod";
import { getModelName, getOpenAIClient } from "./openai-client";
import { store } from "./context-store";
import { BatchOutputSchema } from "./schemas";
import { buildWriterSystemPrompt, buildWriterUserPrompt } from "./prompts";
import { stripEmDashes } from "./sanitize";
import type { BatchBlueprint, StoryBible } from "./types";

const RECENT_PROSE_COUNT = 2;         // include last N batches with full prose
const ROLLING_SUMMARY_COUNT = 8;      // older batches contributing summaries only


export interface BatchWriteResult {
  wordsInBatch: number;
  openThreads: string;
  durationMs: number;
}

export class WriterAgent {
  async writeBatch(
    projectId: string,
    blueprint: BatchBlueprint,
    lastOpenThreads: string | undefined
  ): Promise<BatchWriteResult> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.bible) throw new Error("Project has no book blueprint — plan first");

    const bible: StoryBible = project.bible;
    const client = getOpenAIClient();
    const model = getModelName(project.plan);

    const allBatches = project.batches;
    const recentBatches = allBatches.slice(-RECENT_PROSE_COUNT);
    const olderSummaries = allBatches
      .slice(0, Math.max(0, allBatches.length - RECENT_PROSE_COUNT))
      .slice(-ROLLING_SUMMARY_COUNT);

    const isFinalBatch = blueprint.number >= bible.totalBatches;

    await store.appendEvent(projectId, {
      type: "batch_start",
      batchNumber: blueprint.number,
      totalWords: project.totalWords,
      model,
    });

    const instructions = buildWriterSystemPrompt();
    const input = buildWriterUserPrompt({
      input: project.input,
      bible,
      blueprint,
      recentBatches,
      recentSummaries: olderSummaries,
      lastOpenThreads,
      isFinalBatch,
      totalWords: project.totalWords,
      targetWords: project.targetWords,
    });

    const started = Date.now();
    const response = await client.responses.parse({
      model,
      instructions,
      input,
      text: {
        format: zodTextFormat(BatchOutputSchema, "batch_output"),
      },
    });
    const durationMs = Date.now() - started;

    const parsed = response.output_parsed;
    if (!parsed) throw new Error(`Writer returned no parsed output (batch ${blueprint.number})`);

    // Hard-enforce the zero-em-dash rule. The prompt forbids them but models
    // slip; this guarantees nothing dash-based reaches the stored manuscript.
    const cleanProse = stripEmDashes(parsed.prose);
    const cleanSummary = stripEmDashes(parsed.summary);
    const cleanOpenThreads = stripEmDashes(parsed.openThreads);

    const appended = await store.appendBatch(projectId, {
      prose: cleanProse,
      chapterNumber: blueprint.chapterNumber,
      chapterTitle: blueprint.chapterTitle,
      chapterSummary: cleanSummary,
    });

    const updated = await store.getProject(projectId);
    await store.appendEvent(projectId, {
      type: "batch_complete",
      batchNumber: blueprint.number,
      wordsInBatch: appended?.wordCount ?? 0,
      totalWords: updated?.totalWords ?? 0,
      durationMs,
      model,
    });

    return {
      wordsInBatch: appended?.wordCount ?? 0,
      openThreads: cleanOpenThreads,
      durationMs,
    };
  }
}

export const writerAgent = new WriterAgent();
