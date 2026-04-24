import type {
  Batch,
  BatchEvent,
  BookCover,
  BookProject,
  FullContext,
  LengthPreset,
  ProjectInput,
  ProjectStatus,
  StoryBible,
} from "./types";

const LENGTH_TARGET_WORDS: Record<LengthPreset, number> = {
  dev:    12000,   //  ~48 pages — developer test sample
  short:  24000,   //  ~96 pages
  medium: 40000,   // ~160 pages
  long:   60000,   // ~240 pages — novel
  large:  120000,  // ~480 pages — epic (was "large novel")
  tome:   188000,  // ~750 pages — tome (max cap, ~67 batches)
};

export const WORDS_PER_BATCH = 2800;

// Long chapters: ~2–3 batches (5,600–8,400 words) per chapter.
// This keeps chapters substantial and avoids web-novel micro-chapter feel.
export const TARGET_BATCHES_PER_CHAPTER = 3;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function makeId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

export class ContextStore {
  private projects = new Map<string, BookProject>();

  createProject(input: ProjectInput): BookProject {
    const targetWords = LENGTH_TARGET_WORDS[input.preferences.length];
    const expectedBatches = Math.max(
      1,
      Math.round(targetWords / WORDS_PER_BATCH)
    );
    const now = new Date().toISOString();
    const project: BookProject = {
      id: makeId(),
      input,
      status: "pending",
      batches: [],
      events: [],
      targetWords,
      totalWords: 0,
      expectedBatches,
      coverStatus: "pending",
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(project.id, project);
    return project;
  }

  getProject(id: string): BookProject | undefined {
    return this.projects.get(id);
  }

  updateStatus(id: string, status: ProjectStatus, error?: string): void {
    const p = this.projects.get(id);
    if (!p) return;
    p.status = status;
    if (error) p.error = error;
    p.updatedAt = new Date().toISOString();
  }

  setBible(id: string, bible: StoryBible): void {
    const p = this.projects.get(id);
    if (!p) return;
    p.bible = bible;
    p.expectedBatches = bible.totalBatches;
    if (!p.title) p.title = bible.title;
    if (!p.synopsis) p.synopsis = bible.synopsis;
    p.coverStatus = "pending";
    p.cover = undefined;
    p.coverError = undefined;
    p.updatedAt = new Date().toISOString();
  }

  appendBatch(
    id: string,
    batch: Omit<Batch, "wordCount" | "createdAt" | "batchNumber">
  ): Batch | undefined {
    const p = this.projects.get(id);
    if (!p) return undefined;
    const full: Batch = {
      ...batch,
      batchNumber: p.batches.length + 1,
      wordCount: countWords(batch.prose),
      createdAt: new Date().toISOString(),
    };
    p.batches.push(full);
    p.totalWords += full.wordCount;
    p.updatedAt = full.createdAt;
    return full;
  }

  appendEvent(id: string, event: Omit<BatchEvent, "timestamp">): void {
    const p = this.projects.get(id);
    if (!p) return;
    p.events.push({ ...event, timestamp: new Date().toISOString() });
    p.updatedAt = new Date().toISOString();
  }

  updateMetadata(
    id: string,
    meta: { title?: string; synopsis?: string }
  ): void {
    const p = this.projects.get(id);
    if (!p) return;
    if (meta.title && !p.title) p.title = meta.title;
    if (meta.synopsis && !p.synopsis) p.synopsis = meta.synopsis;
    p.updatedAt = new Date().toISOString();
  }

  updateCoverStatus(id: string, status: BookProject["coverStatus"], error?: string): void {
    const p = this.projects.get(id);
    if (!p) return;
    p.coverStatus = status;
    if (error) p.coverError = error;
    if (status !== "failed") p.coverError = undefined;
    p.updatedAt = new Date().toISOString();
  }

  setCover(id: string, cover: BookCover): void {
    const p = this.projects.get(id);
    if (!p) return;
    p.cover = cover;
    p.coverStatus = "complete";
    p.coverError = undefined;
    p.updatedAt = cover.createdAt;
  }

  getFullContext(id: string): FullContext | undefined {
    const p = this.projects.get(id);
    if (!p) return undefined;
    return {
      input: p.input,
      batches: p.batches,
      totalWords: p.totalWords,
      targetWords: p.targetWords,
      expectedBatches: p.expectedBatches,
      currentBatchNumber: p.batches.length + 1,
    };
  }

  listProjects(): BookProject[] {
    return Array.from(this.projects.values()).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }
}

declare global {
  var __folioContextStore: ContextStore | undefined;
}

export const store: ContextStore =
  globalThis.__folioContextStore ??
  (globalThis.__folioContextStore = new ContextStore());
