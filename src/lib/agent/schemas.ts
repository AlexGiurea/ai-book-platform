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

export const ThreadLedgerEntrySchema = z.object({
  id: z.string(),
  description: z.string(),
  plantBatch: z.number(),
  resolveByBatch: z.number(),
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
  threadLedger: z.array(ThreadLedgerEntrySchema).nullable().optional(),
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
  threadLedger: z.array(ThreadLedgerEntrySchema).nullable().optional(),
});

export const BatchSegmentOutputSchema = z.object({
  batches: z.array(BatchBlueprintSchema),
});

export type StoryBibleSpineParsed = z.infer<typeof StoryBibleSpineSchema>;

// ─── Writer per-batch output ─────────────────────────────────

export const ThreadOpenedSchema = z.object({
  id: z.string().describe("Stable concise thread id from threadLedger when possible"),
  description: z.string(),
});

export const ThreadResolvedSchema = z.object({
  id: z.string().describe("Exact thread id to resolve"),
});

export const BatchOutputSchema = z.object({
  prose: z.string(),
  summary: z.string(),        // 2–3 sentence factual recap of this batch
  openThreads: z.string(),    // dangling threads / promises for the next batch (legacy display)
  stateDelta: z.object({
    newFacts: z.array(z.string()).describe("Few timeline/world facts established this batch"),
    characterUpdates: z
      .array(
        z.object({
          name: z.string(),
          status: z.string().describe("Brief location/knowledge/emotional state"),
        })
      )
      .describe("Characters whose state changed; few items max"),
    threadsOpened: z
      .array(ThreadOpenedSchema)
      .describe("New dangling threads opened with stable ids"),
    threadsResolved: z
      .array(ThreadResolvedSchema)
      .describe("Threads closed this batch by exact id"),
  }),
});

export const CritiqueOutputSchema = z.object({
  issues: z.array(
    z.object({
      description: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      /** Absolute 1-based manuscript batch number (must be one of the allowed chapter batches). */
      batchNumber: z.number(),
    })
  ),
  beatsMissed: z.array(z.string()),
  verdict: z.enum(["pass", "revise"]),
});

export const PlanAuditIssueSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.enum([
    "coverage",
    "ending",
    "setup_payoff",
    "thread_ledger",
    "character_arc",
    "pov_tense_style",
    "continuity",
    "length",
    "other",
  ]),
  chapterNumber: z.number().nullable(),
  batchNumber: z.number().nullable(),
  repairInstruction: z.string(),
});

export const PlanAuditOutputSchema = z.object({
  issues: z.array(PlanAuditIssueSchema),
  verdict: z.enum(["pass", "repair"]),
  summary: z.string(),
});

export const PlanRepairOutputSchema = z.object({
  chapterReplacements: z
    .array(ChapterPlanSchema)
    .nullable()
    .describe("Complete replacement chapter plans for flagged chapters only"),
  batchReplacements: z
    .array(BatchBlueprintSchema)
    .nullable()
    .describe("Complete replacement batch blueprints for flagged batches only"),
  threadLedgerReplacements: z
    .array(ThreadLedgerEntrySchema)
    .nullable()
    .describe("Complete replacement thread ledger entries by id"),
  notes: z.string().nullable(),
});

export const RevisionVerifierOutputSchema = z.object({
  fixed: z.boolean(),
  remainingIssues: z.array(z.string()),
  notes: z.string().nullable(),
});

export type BatchOutputParsed = z.infer<typeof BatchOutputSchema>;
export type CritiqueOutputParsed = z.infer<typeof CritiqueOutputSchema>;
export type StoryBibleParsed = z.infer<typeof StoryBibleSchema>;
export type PlanAuditOutputParsed = z.infer<typeof PlanAuditOutputSchema>;
export type PlanRepairOutputParsed = z.infer<typeof PlanRepairOutputSchema>;
export type RevisionVerifierOutputParsed = z.infer<
  typeof RevisionVerifierOutputSchema
>;
