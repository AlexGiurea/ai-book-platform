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
  totalBatches: number;
  targetWords: number;
  createdAt: string;
}

// ─── Batch / events / project ────────────────────────────────

export interface Batch {
  batchNumber: number;
  chapterNumber?: number;
  chapterTitle?: string;
  chapterSummary?: string;   // summary of what THIS batch did
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
  | "planning_complete"
  | "memory_index_start"
  | "memory_index_complete"
  | "memory_index_failed"
  | "cover_start"
  | "cover_complete"
  | "cover_failed"
  | "batch_start"
  | "batch_complete"
  | "project_complete"
  | "project_failed";

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
}

export type ProjectStatus =
  | "pending"
  | "queued"
  | "planning"
  | "awaiting_approval"
  | "writing"
  | "complete"
  | "failed";

export interface BookProject {
  id: string;
  userId?: string;
  plan: SubscriptionPlan;
  input: ProjectInput;
  status: ProjectStatus;
  bible?: StoryBible;
  vectorStoreId?: string;
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
}

export interface FullContext {
  input: ProjectInput;
  batches: Batch[];
  totalWords: number;
  targetWords: number;
  expectedBatches: number;
  currentBatchNumber: number;
}

export type GenerationJobType = "plan" | "write" | "cover";
export type GenerationJobStatus = "queued" | "running" | "complete" | "failed";

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
  createdAt: string;
  updatedAt: string;
}

export interface RetrievalDocumentRecord {
  id: string;
  projectId: string;
  sourceType: string;
  sourceId: string;
  title: string;
  contentHash: string;
  vectorStoreId: string;
  openaiFileId: string;
  vectorStoreFileId?: string;
  metadata: Record<string, string | number | boolean>;
  indexedAt: string;
}
