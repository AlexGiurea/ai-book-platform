import { zodTextFormat } from "openai/helpers/zod";
import { getModelName, getOpenAIClient } from "./openai-client";
import { store, TARGET_BATCHES_PER_CHAPTER, WORDS_PER_BATCH } from "./context-store";
import { StoryBibleSchema } from "./schemas";
import { buildPlannerSystemPrompt, buildPlannerUserPrompt } from "./prompts";
import { stripEmDashes } from "./sanitize";
import type { BatchBlueprint, StoryBible } from "./types";

// Upper bound for planner output. Large novel (~43 batches × ~300 tokens each)
// plus bible overhead comfortably fits in 16k output tokens.
const PLANNER_MAX_OUTPUT_TOKENS = 16000;

export class PlannerAgent {
  async generateBible(projectId: string): Promise<StoryBible> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const client = getOpenAIClient();
    const model = getModelName();
    const targetWords = project.targetWords;
    const totalBatches = Math.max(1, Math.round(targetWords / WORDS_PER_BATCH));
    const targetChapters = Math.max(
      1,
      Math.ceil(totalBatches / TARGET_BATCHES_PER_CHAPTER)
    );

    await store.appendEvent(projectId, { type: "planning_start", model });
    const started = Date.now();

    const instructions = buildPlannerSystemPrompt();
    const input = buildPlannerUserPrompt({
      input: project.input,
      targetWords,
      totalBatches,
      targetChapters,
      wordsPerBatch: WORDS_PER_BATCH,
    });

    const response = await client.responses.parse({
      model,
      instructions,
      input,
      max_output_tokens: PLANNER_MAX_OUTPUT_TOKENS,
      text: {
        format: zodTextFormat(StoryBibleSchema, "story_bible"),
      },
    });

    const parsed = response.output_parsed;
    if (!parsed) {
      throw new Error("Planner returned no parsed bible (possibly truncated)");
    }

    // ─── Validate & normalize ──────────────────────────────────
    if (!parsed.chapters.length) {
      throw new Error("Planner returned no chapters");
    }
    if (!parsed.batches.length) {
      throw new Error("Planner returned no batch blueprints");
    }
    if (!parsed.characters.length) {
      throw new Error("Planner returned no characters");
    }

    // Sort, renumber 1..N, and scrub em dashes out of every free-text field so
    // nothing dash-based pollutes the writer's downstream prompts (the voice
    // would otherwise mirror the bible's cadence).
    const normalizedBatches: BatchBlueprint[] = parsed.batches
      .slice()
      .sort((a, b) => a.number - b.number)
      .map((b, i) => ({
        ...b,
        number: i + 1,
        targetWords: b.targetWords || WORDS_PER_BATCH,
        chapterTitle: stripEmDashes(b.chapterTitle),
        settingLocation: stripEmDashes(b.settingLocation),
        toneNote: stripEmDashes(b.toneNote),
        purpose: stripEmDashes(b.purpose),
        scenes: b.scenes.map(stripEmDashes),
        continuityFlags: b.continuityFlags.map(stripEmDashes),
      }));

    // If planner under-delivered by more than 20%, that's a truncation/failure
    const delivered = normalizedBatches.length;
    const minAcceptable = Math.floor(totalBatches * 0.8);
    if (delivered < minAcceptable) {
      throw new Error(
        `Planner produced only ${delivered} batches (expected ~${totalBatches}). Retry planning.`
      );
    }

    // If slight over-delivery, keep the planner's count (it's within tolerance).
    // If slight under-delivery, keep delivered count (composer iterates over bible.batches).

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

    // Ensure every batch is claimed by a chapter (fill gaps by clamping)
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

    await store.setBible(projectId, bible);
    await store.appendEvent(projectId, {
      type: "planning_complete",
      model,
      durationMs: Date.now() - started,
      totalBatches: bible.totalBatches,
      totalChapters: bible.chapters.length,
      bookTitle: bible.title,
    });

    return bible;
  }
}

export const plannerAgent = new PlannerAgent();
