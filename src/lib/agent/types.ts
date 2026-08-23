import type { SubscriptionPlan } from "@/lib/plans";

export type LengthPreset = "dev" | "short" | "medium" | "long" | "large" | "tome";

export interface Preferences {
  genre: string;
  tone: string;
  length: LengthPreset;
  imageStyle: string;
  pov: string;
}

export type InputMode = "text" | "upload" | "canvas";

export interface CanvasCharacter {
  name: string;
  role?: string;        // protagonist, antagonist, mentor, etc. (freeform)
  description: string;  // freeform notes from the user
}

export interface CanvasWorldEntry {
  title: string;        // "Magic system", "The Umberwood", "House Valtori"
  content: string;      // freeform lore
}

export interface CanvasNote {
  title?: string;
  content: string;
}

export interface CanvasInput {
  characters: CanvasCharacter[];
  world: CanvasWorldEntry[];
  notes: CanvasNote[];
}

export interface ProjectInput {
  idea: string;
  preferences: Preferences;
  inputMode: InputMode;
  contextFileNames?: string[];
  contextFileContents?: string[];
  canvas?: CanvasInput;
}

// ─── Story Bible types (Architecture C) ───────────────────────

export interface Character {
  name: string;
  role: string;              // protagonist, antagonist, foil, etc.
  description: string;       // physical + essence
  voice: string;             // speech patterns, vocabulary, rhythm
  motivation: string;
  arc: string;               // how they change across the book
  relationships: string;     // ties to other characters
  secrets?: string;
}

export interface ChapterPlan {
  number: number;
  title: string;
  summary: string;           // 3–5 sentences; what happens in this chapter
  arcPurpose: string;        // why this chapter exists in the story
  openingHook: string;       // how the chapter opens
  closingBeat: string;       // how the chapter lands
  batchStart: number;        // inclusive
  batchEnd: number;          // inclusive
  targetWords: number;
}

export interface BatchBlueprint {
  number: number;
  chapterNumber: number;
  chapterTitle: string;
  positionInChapter: "opening" | "middle" | "closing" | "single";
  purpose: string;           // what this batch must accomplish narratively
  scenes: string[];          // scene-level beats (2–5 items)
  charactersPresent: string[];
  settingLocation: string;
  toneNote: string;          // emotional register of this batch
  continuityFlags: string[]; // canon elements that must be honored
  targetWords: number;
}

/** Planned canonical thread ledger entry (v3 bibles). */
export interface ThreadLedgerEntry {
  id: string;
  description: string;
  plantBatch: number;
  resolveByBatch: number;
}

export interface StoryBible {
  title: string;
  synopsis: string;          // 2–4 sentence back-cover summary
  premise: string;           // the core dramatic question
  logline: string;           // one-sentence hook
  setting: {
    world: string;           // where it happens
    era: string;             // when it happens
    rules: string;           // physics/magic/sociopolitical laws
    atmosphere: string;      // mood, sensory signature
  };
  characters: Character[];
  themes: string[];          // 3–6 thematic throughlines
  structure: {
    actBreakdown: string;    // 3-act or other structural skeleton
    inciting: string;        // inciting incident
    midpoint: string;        // midpoint reversal
    climax: string;          // climax beat
    resolution: string;      // denouement
  };
  voiceGuide: string;        // POV, tense, sentence rhythm, diction
  styleGuide: string;        // descriptive density, dialogue ratio, etc.
  chapters: ChapterPlan[];
  batches: BatchBlueprint[];
  /** Planned thread IDs for exact open/resolve semantics (v3; default []). */
  threadLedger?: ThreadLedgerEntry[];
  totalBatches: number;
  targetWords: number;
  createdAt: string;
}

// ─── Story state (rolling continuity ledger) ─────────────────

export interface StoryStateCharacter {
  name: string;
  status: string;
}

export interface StoryStateThread {
  id: string;
  description: string;
  openedBatch: number;
}

export interface StoryState {
  facts: string[];
  characters: StoryStateCharacter[];
  /** Canonical open threads — structured IDs (legacy string[] normalized on read). */
  openThreads: StoryStateThread[];
}

export interface ThreadOpened {
  id: string;
  description: string;
  openedBatch?: number;
}

export interface ThreadResolved {
  id: string;
}

export interface StateDelta {
  newFacts: string[];
  characterUpdates: StoryStateCharacter[];
  /** Prefer {id, description}; legacy string[] accepted via normalizeStateDelta. */
  threadsOpened: ThreadOpened[];
  threadsResolved: ThreadResolved[];
}

export {
  emptyStoryState,
  mergeStoryStateDelta,
  STORY_STATE_FACT_CAP,
  rebuildStoryStateFromDeltas,
  rebuildStoryStateBeforeBatch,
} from "./story-state";

// ─── Batch / events / project ────────────────────────────────

export interface Batch {
  batchNumber: number;
  chapterNumber?: number;
  chapterTitle?: string;
  chapterSummary?: string;   // summary of what THIS batch did
  /** Legacy display string; canonical threads live in stateDelta / StoryState. */
  openThreads?: string;
  /** Exact accepted writer/reviser StateDelta for this batch (canonical rebuild source). */
  stateDelta?: StateDelta;
  /** Last applied revision key (idempotent revise replay). */
  lastRevisionKey?: string;
  prose: string;
  wordCount: number;
  createdAt: string;
}

export type CoverStatus = "pending" | "generating" | "complete" | "failed";

export interface BookCover {
  imageUrl: string;
  prompt: string;
  model: string;
  createdAt: string;
}

export type BatchEventType =
  | "project_start"
  | "planning_start"
  | "planning_heartbeat"
  | "planning_spine_complete"
  | "planning_batches_progress"
  | "planning_complete"
  | "plan_audit"
  | "plan_repaired"
  | "cover_start"
  | "cover_complete"
  | "cover_failed"
  | "batch_start"
  | "batch_complete"
  | "chapter_critique"
  | "batch_revised"
  | "revision_verified"
  | "project_complete"
  | "project_failed"
  | "project_cancelled";

export interface BatchEvent {
  type: BatchEventType;
  timestamp: string;
  batchNumber?: number;
  wordsInBatch?: number;
  totalWords?: number;
  durationMs?: number;
  model?: string;
  error?: string;
  coverImageUrl?: string;
  // Planning payload (for planning_complete)
  totalBatches?: number;
  totalChapters?: number;
  bookTitle?: string;
  /** Staged planning: blueprint rows finished so far */
  completedBatches?: number;
  /** Staged planning: total blueprint rows planned for the manuscript */
  plannedBatchesTotal?: number;
  /** Critique / revise */
  chapterNumber?: number;
  verdict?: "pass" | "revise" | "repair" | "warning";
  issueCount?: number;
  /** Revision verifier */
  fixed?: boolean;
}

export type ProjectStatus =
  | "pending"
  | "queued"
  | "planning"
  | "awaiting_approval"
  | "writing"
  | "complete"
  | "failed"
  | "cancelled";

export interface BookProject {
  id: string;
  userId?: string;
  userEmail?: string;
  plan: SubscriptionPlan;
  input: ProjectInput;
  status: ProjectStatus;
  bible?: StoryBible;
  storyState?: StoryState;
  /** Snapshotted at createProject — agents must use this, not live env. */
  pipelineVersion?: string;
  modelConfig?: import("./model-config").ProjectPipelineConfig;
  batches: Batch[];
  events: BatchEvent[];
  targetWords: number;
  totalWords: number;
  expectedBatches: number;
  title?: string;
  synopsis?: string;
  coverStatus: CoverStatus;
  cover?: BookCover;
  coverError?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  /** Latest generation_jobs rows for this project (set by GET /api/project/[id] for UI debugging). */
  generationJobs?: GenerationJob[];
}

export interface FullContext {
  input: ProjectInput;
  batches: Batch[];
  totalWords: number;
  targetWords: number;
  expectedBatches: number;
  currentBatchNumber: number;
}

export type GenerationJobType =
  | "plan"
  | "plan_batches"
  | "plan_audit"
  | "plan_repair"
  | "write"
  | "cover"
  | "critique_chapter"
  | "revise_batch"
  | "verify_revision";
export type GenerationJobStatus = "queued" | "running" | "complete" | "failed";

export interface WriteJobPayload {
  /** Absolute 1-based batch number into bible.batches[batchNumber-1]. */
  batchNumber: number;
}

export interface CritiqueChapterPayload {
  chapterNumber: number;
  /** When true, complete the project after critique/revise/verify instead of enqueueing the next write. */
  isFinalChapter?: boolean;
}

export interface CritiqueIssue {
  description: string;
  severity: "low" | "medium" | "high";
  /** Absolute 1-based batch number within the manuscript. */
  batchNumber: number;
}

export interface ReviseBatchPayload {
  batchNumber: number;
  chapterNumber: number;
  issues: CritiqueIssue[];
  beatsMissed: string[];
  isFinalChapter?: boolean;
  /** Deterministic revision key for idempotent replace. */
  revisionKey?: string;
}

export interface VerifyRevisionPayload {
  batchNumber: number;
  chapterNumber: number;
  issues: CritiqueIssue[];
  beatsMissed: string[];
  isFinalChapter?: boolean;
  revisionKey?: string;
}

export interface PlanJobPayload {
  /** Namespace shared by every planning stage for one initial/replan run. */
  planningRunId?: string;
}

export interface PlanAuditPayload {
  pass: number;
  planningRunId?: string;
}

export interface PlanAuditIssue {
  severity: "low" | "medium" | "high";
  category:
    | "coverage"
    | "ending"
    | "setup_payoff"
    | "thread_ledger"
    | "character_arc"
    | "pov_tense_style"
    | "continuity"
    | "length"
    | "other";
  chapterNumber: number | null;
  batchNumber: number | null;
  repairInstruction: string;
}

export interface PlanRepairPayload {
  pass?: number;
  planningRunId?: string;
  /** Bounded to high-severity audit findings only. */
  issues: PlanAuditIssue[];
}

export type GenerationJobPayload =
  | PlanJobPayload
  | WriteJobPayload
  | CritiqueChapterPayload
  | ReviseBatchPayload
  | VerifyRevisionPayload
  | PlanAuditPayload
  | PlanRepairPayload
  | Record<string, unknown>;

export interface GenerationJob {
  id: string;
  projectId: string;
  type: GenerationJobType;
  status: GenerationJobStatus;
  attempts: number;
  runAfter: string;
  lockedAt?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  payload?: GenerationJobPayload;
  /** Deterministic idempotency key (unique per project when set). */
  dedupeKey?: string;
  createdAt: string;
  updatedAt: string;
}
