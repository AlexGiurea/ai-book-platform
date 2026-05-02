import { z } from "zod";

// ─── Story Bible schemas (planner output) ────────────────────

export const CharacterSchema = z.object({
  name: z.string(),
  role: z.string(),
  description: z.string(),
  voice: z.string(),
  motivation: z.string(),
  arc: z.string(),
  relationships: z.string(),
  secrets: z.string().nullable(),
});

export const ChapterPlanSchema = z.object({
  number: z.number(),
  title: z.string(),
  summary: z.string(),
  arcPurpose: z.string(),
  openingHook: z.string(),
  closingBeat: z.string(),
  batchStart: z.number(),
  batchEnd: z.number(),
  targetWords: z.number(),
});

export const BatchBlueprintSchema = z.object({
  number: z.number(),
  chapterNumber: z.number(),
  chapterTitle: z.string(),
  positionInChapter: z.enum(["opening", "middle", "closing", "single"]),
  purpose: z.string(),
  scenes: z.array(z.string()),
  charactersPresent: z.array(z.string()),
  settingLocation: z.string(),
  toneNote: z.string(),
  continuityFlags: z.array(z.string()),
  targetWords: z.number(),
});

export const StoryBibleSchema = z.object({
  title: z.string(),
  synopsis: z.string(),
  premise: z.string(),
  logline: z.string(),
  setting: z.object({
    world: z.string(),
    era: z.string(),
    rules: z.string(),
    atmosphere: z.string(),
  }),
  characters: z.array(CharacterSchema),
  themes: z.array(z.string()),
  structure: z.object({
    actBreakdown: z.string(),
    inciting: z.string(),
    midpoint: z.string(),
    climax: z.string(),
    resolution: z.string(),
  }),
  voiceGuide: z.string(),
  styleGuide: z.string(),
  chapters: z.array(ChapterPlanSchema),
  batches: z.array(BatchBlueprintSchema),
});

/** Spine phase: chapters include target pacing but not yet batch indices (those are computed in code). */
export const ChapterSpineSchema = z.object({
  number: z.number(),
  title: z.string(),
  summary: z.string(),
  arcPurpose: z.string(),
  openingHook: z.string(),
  closingBeat: z.string(),
  targetWords: z.number(),
});

export const StoryBibleSpineSchema = z.object({
  title: z.string(),
  synopsis: z.string(),
  premise: z.string(),
  logline: z.string(),
  setting: z.object({
    world: z.string(),
    era: z.string(),
    rules: z.string(),
    atmosphere: z.string(),
  }),
  characters: z.array(CharacterSchema),
  themes: z.array(z.string()),
  structure: z.object({
    actBreakdown: z.string(),
    inciting: z.string(),
    midpoint: z.string(),
    climax: z.string(),
    resolution: z.string(),
  }),
  voiceGuide: z.string(),
  styleGuide: z.string(),
  chapters: z.array(ChapterSpineSchema),
});

export const BatchSegmentOutputSchema = z.object({
  batches: z.array(BatchBlueprintSchema),
});

export type StoryBibleSpineParsed = z.infer<typeof StoryBibleSpineSchema>;

// ─── Writer per-batch output ─────────────────────────────────

export const BatchOutputSchema = z.object({
  prose: z.string(),
  summary: z.string(),        // 2–3 sentence factual recap of this batch
  openThreads: z.string(),    // dangling threads / promises for the next batch
});

export type BatchOutputParsed = z.infer<typeof BatchOutputSchema>;
export type StoryBibleParsed = z.infer<typeof StoryBibleSchema>;
