import { zodTextFormat } from "openai/helpers/zod";
import { getModelName, getOpenAIClient } from "./openai-client";
import { PLANNER_TIMEOUT_MS } from "./constants";
import { store, TARGET_BATCHES_PER_CHAPTER, WORDS_PER_BATCH } from "./context-store";
import { toGenerationCancelled } from "./generation-errors";
import {
  BatchSegmentOutputSchema,
  StoryBibleSchema,
  StoryBibleSpineSchema,
  type StoryBibleSpineParsed,
} from "./schemas";
import {
  buildPlannerBatchSegmentSystemPrompt,
  buildPlannerBatchSegmentUserPrompt,
  buildPlannerSpineSystemPrompt,
  buildPlannerSpineUserPrompt,
  buildPlannerSystemPrompt,
  buildPlannerUserPrompt,
  summarizeBibleForSegmentPrompt,
} from "./prompts";
import { stripEmDashes } from "./sanitize";
import type { BatchBlueprint, ChapterPlan, StoryBible } from "./types";

/** Books with more batches than this use spine + chunked batch blueprints (each job stays under serverless runtime). */
export const MONOLITHIC_PLAN_BATCH_CAP = 13;
/** Per OpenAI Responses call when extending blueprints incrementally (~10 batches keeps runtime predictable). */
export const BLUEPRINT_SEGMENT_BATCH_COUNT = 10;

// Upper bound for planner output. Large novel (~43 batches × ~300 tokens each)
// plus bible overhead comfortably fits in 16k output tokens.
const PLANNER_MAX_OUTPUT_TOKENS = 16000;

type ChapterSpine = StoryBibleSpineParsed["chapters"][number];

function allocateChapterBatchCounts(
  chapters: ChapterSpine[],
  totalBatches: number
): number[] {
  const n = chapters.length;
  if (n === 0) throw new Error("Spine returned no chapters");
  if (totalBatches < n) {
    throw new Error(`Not enough batches (${totalBatches}) for ${n} chapters`);
  }
  const weights = chapters.map((c) => Math.max(1, c.targetWords ?? 1));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const remaining = totalBatches - n;
  const raw = weights.map((w) => (remaining * w) / sumW);
  const floors = raw.map((r) => Math.floor(r));
  let slack = remaining - floors.reduce((a, b) => a + b, 0);
  const fracs = raw.map((r, i) => ({ i, rem: r - Math.floor(r) }));
  fracs.sort((a, b) => b.rem - a.rem);
  for (let k = 0; k < slack; k++) {
    floors[fracs[k].i]++;
  }
  return floors.map((f) => f + 1);
}

export function spineChaptersToPlans(
  chapters: ChapterSpine[],
  totalBatches: number
): ChapterPlan[] {
  const sorted = chapters
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((c, i) => ({ ...c, number: i + 1 }));

  const counts = allocateChapterBatchCounts(sorted, totalBatches);
  let start = 1;
  const out: ChapterPlan[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const ch = sorted[i];
    const cnt = counts[i];
    const batchEnd = start + cnt - 1;
    out.push({
      number: ch.number,
      title: stripEmDashes(ch.title),
      summary: stripEmDashes(ch.summary),
      arcPurpose: stripEmDashes(ch.arcPurpose),
      openingHook: stripEmDashes(ch.openingHook),
      closingBeat: stripEmDashes(ch.closingBeat),
      batchStart: start,
      batchEnd,
      targetWords: ch.targetWords,
    });
    start = batchEnd + 1;
  }
  return out;
}

function normalizeBlueprintSequential(
  parsed: BatchBlueprint[],
  wordsDefault: number
): BatchBlueprint[] {
  return parsed
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((b, i) => ({
      ...b,
      number: i + 1,
      targetWords: b.targetWords || wordsDefault,
      chapterTitle: stripEmDashes(b.chapterTitle),
      settingLocation: stripEmDashes(b.settingLocation),
      toneNote: stripEmDashes(b.toneNote),
      purpose: stripEmDashes(b.purpose),
      scenes: b.scenes.map(stripEmDashes),
      continuityFlags: b.continuityFlags.map(stripEmDashes),
    }));
}

/** Keep absolute batch numbering for a spine segment (batchStart .. batchEnd). */
function normalizeBlueprintSlice(
  parsed: BatchBlueprint[],
  batchStart: number,
  wordsDefault: number
): BatchBlueprint[] {
  const sorted = parsed.slice().sort((a, b) => a.number - b.number);
  return sorted.map((b, i) => ({
    ...b,
    number: batchStart + i,
    targetWords: b.targetWords || wordsDefault,
    chapterTitle: stripEmDashes(b.chapterTitle),
    settingLocation: stripEmDashes(b.settingLocation),
    toneNote: stripEmDashes(b.toneNote),
    purpose: stripEmDashes(b.purpose),
    scenes: b.scenes.map(stripEmDashes),
    continuityFlags: b.continuityFlags.map(stripEmDashes),
  }));
}

function buildStoryBibleFromSpinePayload(
  parsed: StoryBibleSpineParsed,
  chapterPlans: ChapterPlan[],
  batches: BatchBlueprint[],
  targetWords: number,
  totalBatches: number
): StoryBible {
  return {
    title: stripEmDashes(parsed.title),
    logline: stripEmDashes(parsed.logline),
    synopsis: stripEmDashes(parsed.synopsis),
    premise: stripEmDashes(parsed.premise),
    voiceGuide: stripEmDashes(parsed.voiceGuide),
    styleGuide: stripEmDashes(parsed.styleGuide),
    themes: parsed.themes.map(stripEmDashes),
    setting: {
      world: stripEmDashes(parsed.setting.world),
      era: stripEmDashes(parsed.setting.era),
      rules: stripEmDashes(parsed.setting.rules),
      atmosphere: stripEmDashes(parsed.setting.atmosphere),
    },
    structure: {
      actBreakdown: stripEmDashes(parsed.structure.actBreakdown),
      inciting: stripEmDashes(parsed.structure.inciting),
      midpoint: stripEmDashes(parsed.structure.midpoint),
      climax: stripEmDashes(parsed.structure.climax),
      resolution: stripEmDashes(parsed.structure.resolution),
    },
    characters: parsed.characters.map((c) => ({
      ...c,
      name: stripEmDashes(c.name),
      role: stripEmDashes(c.role),
      description: stripEmDashes(c.description),
      voice: stripEmDashes(c.voice),
      motivation: stripEmDashes(c.motivation),
      arc: stripEmDashes(c.arc),
      relationships: stripEmDashes(c.relationships),
      secrets: c.secrets ? stripEmDashes(c.secrets) : undefined,
    })),
    chapters: chapterPlans,
    batches,
    totalBatches,
    targetWords,
    createdAt: new Date().toISOString(),
  };
}

export class PlannerAgent {
  /** Single Responses call producing the full bible (shorter books). */
  async generateBibleMonolithic(projectId: string): Promise<void> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const client = getOpenAIClient();
    const model = getModelName(project.plan);
    const targetWords = project.targetWords;
    const totalBatches = Math.max(1, Math.round(targetWords / WORDS_PER_BATCH));
    const targetChapters = Math.max(
      1,
      Math.ceil(totalBatches / TARGET_BATCHES_PER_CHAPTER)
    );

    await store.appendEvent(projectId, { type: "planning_start", model });
    const started = Date.now();
    console.info("[planner] monolithic start", {
      projectId,
      model,
      plan: project.plan,
      targetWords,
      totalBatches,
      targetChapters,
    });

    const instructions = buildPlannerSystemPrompt();
    const input = buildPlannerUserPrompt({
      input: project.input,
      targetWords,
      totalBatches,
      targetChapters,
      wordsPerBatch: WORDS_PER_BATCH,
      phase: "full",
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const timeoutController = new AbortController();
    let plannerTimedOut = false;
    const timeout = setTimeout(() => {
      plannerTimedOut = true;
      timeoutController.abort();
    }, PLANNER_TIMEOUT_MS);
    const requestSignal =
      genSignal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([genSignal, timeoutController.signal])
        : timeoutController.signal;
    const HEARTBEAT_MS = 30_000;
    const heartbeat = setInterval(() => {
      void store
        .appendEvent(projectId, {
          type: "planning_heartbeat",
          model,
          durationMs: Date.now() - started,
        })
        .catch(() => undefined);
    }, HEARTBEAT_MS);
    let response;
    try {
      response = await client.responses.parse(
        {
          model,
          instructions,
          input,
          max_output_tokens: PLANNER_MAX_OUTPUT_TOKENS,
          text: {
            format: zodTextFormat(StoryBibleSchema, "story_bible"),
          },
        },
        { signal: requestSignal }
      );
    } catch (err) {
      if (plannerTimedOut) {
        console.warn("[planner] monolithic timed out", {
          projectId,
          model,
          elapsedMs: Date.now() - started,
          timeoutMs: PLANNER_TIMEOUT_MS,
        });
        throw new Error(
          `Planner exceeded ${Math.round(
            PLANNER_TIMEOUT_MS / 1000
          )}s before Vercel's runtime limit. Try a shorter book length or upload less context.`
        );
      }
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw err;
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
    }

    const parsed = response.output_parsed;
    if (!parsed) {
      throw new Error("Planner returned no parsed bible (possibly truncated)");
    }
    if (!parsed.chapters.length) throw new Error("Planner returned no chapters");
    if (!parsed.batches.length) throw new Error("Planner returned no batch blueprints");
    if (!parsed.characters.length) throw new Error("Planner returned no characters");

    const normalizedBatches: BatchBlueprint[] = normalizeBlueprintSequential(
      parsed.batches,
      WORDS_PER_BATCH
    );

    const delivered = normalizedBatches.length;
    const minAcceptable = Math.floor(totalBatches * 0.8);
    if (delivered < minAcceptable) {
      throw new Error(
        `Planner produced only ${delivered} batches (expected ~${totalBatches}). Retry planning.`
      );
    }

    const normalizedChapters = parsed.chapters
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((c, i) => ({
        ...c,
        number: i + 1,
        title: stripEmDashes(c.title),
        summary: stripEmDashes(c.summary),
        arcPurpose: stripEmDashes(c.arcPurpose),
        openingHook: stripEmDashes(c.openingHook),
        closingBeat: stripEmDashes(c.closingBeat),
      }));

    const maxBatchNumber = normalizedBatches.length;
    for (const ch of normalizedChapters) {
      ch.batchStart = Math.max(1, Math.min(ch.batchStart, maxBatchNumber));
      ch.batchEnd = Math.max(ch.batchStart, Math.min(ch.batchEnd, maxBatchNumber));
    }

    const bible: StoryBible = {
      ...parsed,
      title: stripEmDashes(parsed.title),
      logline: stripEmDashes(parsed.logline),
      synopsis: stripEmDashes(parsed.synopsis),
      premise: stripEmDashes(parsed.premise),
      voiceGuide: stripEmDashes(parsed.voiceGuide),
      styleGuide: stripEmDashes(parsed.styleGuide),
      themes: parsed.themes.map(stripEmDashes),
      setting: {
        world: stripEmDashes(parsed.setting.world),
        era: stripEmDashes(parsed.setting.era),
        rules: stripEmDashes(parsed.setting.rules),
        atmosphere: stripEmDashes(parsed.setting.atmosphere),
      },
      structure: {
        actBreakdown: stripEmDashes(parsed.structure.actBreakdown),
        inciting: stripEmDashes(parsed.structure.inciting),
        midpoint: stripEmDashes(parsed.structure.midpoint),
        climax: stripEmDashes(parsed.structure.climax),
        resolution: stripEmDashes(parsed.structure.resolution),
      },
      characters: parsed.characters.map((c) => ({
        ...c,
        name: stripEmDashes(c.name),
        role: stripEmDashes(c.role),
        description: stripEmDashes(c.description),
        voice: stripEmDashes(c.voice),
        motivation: stripEmDashes(c.motivation),
        arc: stripEmDashes(c.arc),
        relationships: stripEmDashes(c.relationships),
        secrets: c.secrets ? stripEmDashes(c.secrets) : undefined,
      })),
      chapters: normalizedChapters,
      batches: normalizedBatches,
      totalBatches: normalizedBatches.length,
      targetWords,
      createdAt: new Date().toISOString(),
    };

    await this.persistCompleteBible(projectId, bible, model, Date.now() - started);
  }

  /** Spine only; saves bible with batches [] and emits planning_spine_complete. */
  async generateBibleSpine(projectId: string): Promise<void> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const client = getOpenAIClient();
    const model = getModelName(project.plan);
    const targetWords = project.targetWords;
    const totalBatches = Math.max(1, Math.round(targetWords / WORDS_PER_BATCH));
    const targetChapters = Math.max(
      1,
      Math.ceil(totalBatches / TARGET_BATCHES_PER_CHAPTER)
    );

    await store.appendEvent(projectId, { type: "planning_start", model });
    const started = Date.now();
    console.info("[planner] staged spine start", {
      projectId,
      model,
      targetWords,
      totalBatches,
      targetChapters,
    });

    const instructions = buildPlannerSpineSystemPrompt({
      totalBatches,
      wordsPerBatch: WORDS_PER_BATCH,
      targetChapters,
    });
    const input = buildPlannerSpineUserPrompt({
      input: project.input,
      targetWords,
      totalBatches,
      targetChapters,
      wordsPerBatch: WORDS_PER_BATCH,
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const timeoutController = new AbortController();
    let plannerTimedOut = false;
    const timeout = setTimeout(() => {
      plannerTimedOut = true;
      timeoutController.abort();
    }, PLANNER_TIMEOUT_MS);
    const requestSignal =
      genSignal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([genSignal, timeoutController.signal])
        : timeoutController.signal;
    const HEARTBEAT_MS = 30_000;
    const heartbeat = setInterval(() => {
      void store
        .appendEvent(projectId, {
          type: "planning_heartbeat",
          model,
          durationMs: Date.now() - started,
        })
        .catch(() => undefined);
    }, HEARTBEAT_MS);

    let response;
    try {
      response = await client.responses.parse(
        {
          model,
          instructions,
          input,
          max_output_tokens: Math.min(PLANNER_MAX_OUTPUT_TOKENS, 8000),
          text: {
            format: zodTextFormat(StoryBibleSpineSchema, "story_spine"),
          },
        },
        { signal: requestSignal }
      );
    } catch (err) {
      if (plannerTimedOut) {
        console.warn("[planner] spine timed out", { projectId, model });
        throw new Error(
          `Planner spine exceeded ${Math.round(
            PLANNER_TIMEOUT_MS / 1000
          )}s. Try shortening the idea/context or pick a moderate length preset.`
        );
      }
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw err;
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
    }

    const spine = response.output_parsed;
    if (!spine?.chapters.length) {
      throw new Error("Spine planner returned no chapters");
    }
    if (!spine.characters.length) {
      throw new Error("Spine planner returned no characters");
    }

    const chapterPlans = spineChaptersToPlans(spine.chapters, totalBatches);

    const bible = buildStoryBibleFromSpinePayload(
      spine,
      chapterPlans,
      [],
      targetWords,
      totalBatches
    );

    await store.setBible(projectId, bible);
    await store.appendEvent(projectId, {
      type: "planning_spine_complete",
      model,
      durationMs: Date.now() - started,
      totalBatches,
      totalChapters: bible.chapters.length,
      bookTitle: bible.title,
    });
    console.info("[planner] spine complete", {
      projectId,
      chapters: bible.chapters.length,
      totalBatches,
    });
  }

  /** Returns true once all batch blueprints are stored and planning_complete emitted. */
  async appendBlueprintSegment(projectId: string): Promise<boolean> {
    const project = await store.getProject(projectId);
    if (!project?.bible)
      throw new Error(`Cannot extend blueprint for ${projectId}: missing bible`);
    const { bible } = project;
    if (bible.batches.length >= bible.totalBatches) {
      return true;
    }

    const client = getOpenAIClient();
    const model = getModelName(project.plan);
    const batchStart = bible.batches.length + 1;
    const batchEnd = Math.min(
      bible.totalBatches,
      batchStart + BLUEPRINT_SEGMENT_BATCH_COUNT - 1
    );
    const expectedLen = batchEnd - batchStart + 1;

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const timeoutController = new AbortController();
    let plannerTimedOut = false;
    const timeout = setTimeout(() => {
      plannerTimedOut = true;
      timeoutController.abort();
    }, PLANNER_TIMEOUT_MS);
    const requestSignal =
      genSignal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([genSignal, timeoutController.signal])
        : timeoutController.signal;

    const startedSeg = Date.now();
    console.info("[planner] segment", { projectId, batchStart, batchEnd, expectedLen });

    const instructions = buildPlannerBatchSegmentSystemPrompt({ batchStart, batchEnd });
    const bibleSummary = summarizeBibleForSegmentPrompt(bible);

    const involvedChapters = bible.chapters.filter(
      (c) => !(c.batchEnd < batchStart || c.batchStart > batchEnd)
    );
    const chapterSlice = involvedChapters
      .map(
        (ch) =>
          `## Chapter ${ch.number}: ${ch.title}\nSummaries:\n${ch.summary}\n` +
          `Arc focus: ${ch.arcPurpose}\nOpening: ${ch.openingHook}\nClosing: ${ch.closingBeat}\n` +
          `Batch span in manuscript: ${ch.batchStart}–${ch.batchEnd}\n`
      )
      .join("\n");

    const precedingBatchesDigest =
      bible.batches.length === 0
        ? ""
        : bible.batches
            .slice(-Math.min(3, bible.batches.length))
            .map(
              (b) =>
                `Batch ${b.number}: ${b.purpose} | tones: ${b.toneNote} | flags: ${b.continuityFlags.join("; ")}`
            )
            .join("\n");

    const segmentInput = buildPlannerBatchSegmentUserPrompt({
      bibleSummary,
      chapterSlice,
      precedingBatchesDigest,
      batchStart,
      batchEnd,
      wordsPerBatch: WORDS_PER_BATCH,
    });

    let response;
    try {
      response = await client.responses.parse(
        {
          model,
          instructions,
          input: segmentInput,
          max_output_tokens: PLANNER_MAX_OUTPUT_TOKENS,
          text: {
            format: zodTextFormat(BatchSegmentOutputSchema, "batch_segment"),
          },
        },
        { signal: requestSignal }
      );
    } catch (err) {
      if (plannerTimedOut) {
        throw new Error(
          `Planner batch segment (${batchStart}–${batchEnd}) exceeded ${Math.round(
            PLANNER_TIMEOUT_MS / 1000
          )}s before the platform limit — retry shortly or shorten context.`
        );
      }
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    const seg = response.output_parsed;
    if (!seg?.batches?.length) {
      throw new Error("Batch segment planner returned empty batches array");
    }
    if (seg.batches.length !== expectedLen) {
      throw new Error(
        `Batch segment produced ${seg.batches.length} blueprints but needed exactly ${expectedLen}`
      );
    }

    const renumberedSlice = normalizeBlueprintSlice(
      seg.batches,
      batchStart,
      WORDS_PER_BATCH
    );

    const merged = [...bible.batches, ...renumberedSlice];
    const nextBible: StoryBible = { ...bible, batches: merged };
    await store.setBible(projectId, nextBible);
    await store.appendEvent(projectId, {
      type: "planning_batches_progress",
      model,
      durationMs: Date.now() - startedSeg,
      completedBatches: merged.length,
      plannedBatchesTotal: bible.totalBatches,
      bookTitle: bible.title,
    });

    console.info("[planner] segment done", {
      projectId,
      nowHave: merged.length,
      needed: bible.totalBatches,
    });

    if (merged.length >= bible.totalBatches) {
      await this.persistCompleteBible(
        projectId,
        nextBible,
        model,
        undefined
      );
      return true;
    }
    return false;
  }

  private async persistCompleteBible(
    projectId: string,
    bible: StoryBible,
    model: string,
    monoDurationMs: number | undefined
  ): Promise<void> {
    const delivered = bible.batches.length;
    const minAcceptable = Math.floor(bible.totalBatches * 0.8);
    if (delivered < minAcceptable) {
      throw new Error(
        `Planner produced only ${delivered} batches (expected ~${bible.totalBatches}). Retry planning.`
      );
    }

    bible.totalBatches = delivered;
    bible.chapters = bible.chapters.map((ch) => {
      const cappedEnd = Math.min(ch.batchEnd, delivered);
      return {
        ...ch,
        batchEnd: cappedEnd,
        batchStart: Math.min(ch.batchStart, cappedEnd),
      };
    });

    await store.setBible(projectId, bible);
    await store.appendEvent(projectId, {
      type: "planning_complete",
      model,
      durationMs: monoDurationMs,
      totalBatches: bible.totalBatches,
      totalChapters: bible.chapters.length,
      bookTitle: bible.title,
    });
    console.info("[planner] complete", {
      projectId,
      model,
      totalBatches: bible.totalBatches,
      title: bible.title,
    });
  }
}

export const plannerAgent = new PlannerAgent();
