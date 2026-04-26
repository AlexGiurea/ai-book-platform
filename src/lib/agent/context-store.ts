import { getSql, hasDatabaseUrl } from "@/lib/db/postgres";
import {
  ACTIVE_DEVELOPMENT_PLAN,
  normalizePlan,
  type SubscriptionPlan,
} from "@/lib/plans";
import { GenerationCancelledError } from "./generation-errors";
import type {
  Batch,
  BatchEvent,
  BookCover,
  BookProject,
  FullContext,
  GenerationJob,
  GenerationJobType,
  LengthPreset,
  ProjectInput,
  ProjectStatus,
  StoryBible,
} from "./types";

const LENGTH_TARGET_WORDS: Record<LengthPreset, number> = {
  dev: 12000,
  short: 24000,
  medium: 40000,
  long: 60000,
  large: 120000,
  tome: 188000,
};

export const WORDS_PER_BATCH = 2800;
export const TARGET_BATCHES_PER_CHAPTER = 3;

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function makeId(): string {
  return (
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 10)
  );
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

type ProjectRow = {
  id: string;
  user_id: string | null;
  plan: string | null;
  input: ProjectInput;
  status: ProjectStatus;
  target_words: number;
  total_words: number;
  expected_batches: number;
  title: string | null;
  synopsis: string | null;
  bible: StoryBible | null;
  cover_status: BookProject["coverStatus"];
  cover: BookCover | null;
  cover_error: string | null;
  error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

type BatchRow = {
  batch_number: number;
  chapter_number: number | null;
  chapter_title: string | null;
  chapter_summary: string | null;
  prose: string;
  word_count: number;
  created_at: string | Date;
};

type EventRow = {
  event: Omit<BatchEvent, "timestamp"> | BatchEvent;
  timestamp: string | Date;
};

type JobRow = {
  id: string;
  project_id: string;
  type: GenerationJobType;
  status: GenerationJob["status"];
  attempts: number;
  run_after: string | Date;
  locked_at: string | Date | null;
  started_at: string | Date | null;
  completed_at: string | Date | null;
  error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function mapBatch(row: BatchRow): Batch {
  return {
    batchNumber: row.batch_number,
    chapterNumber: row.chapter_number ?? undefined,
    chapterTitle: row.chapter_title ?? undefined,
    chapterSummary: row.chapter_summary ?? undefined,
    prose: row.prose,
    wordCount: row.word_count,
    createdAt: iso(row.created_at),
  };
}

function mapEvent(row: EventRow): BatchEvent {
  return {
    ...row.event,
    timestamp: iso(row.timestamp),
  } as BatchEvent;
}

function mapJob(row: JobRow): GenerationJob {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    attempts: row.attempts,
    runAfter: iso(row.run_after),
    lockedAt: row.locked_at ? iso(row.locked_at) : undefined,
    startedAt: row.started_at ? iso(row.started_at) : undefined,
    completedAt: row.completed_at ? iso(row.completed_at) : undefined,
    error: row.error ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapProject(row: ProjectRow, batches: Batch[], events: BatchEvent[]): BookProject {
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    plan: normalizePlan(row.plan),
    input: row.input,
    status: row.status,
    bible: row.bible ?? undefined,
    batches,
    events,
    targetWords: row.target_words,
    totalWords: row.total_words,
    expectedBatches: row.expected_batches,
    title: row.title ?? undefined,
    synopsis: row.synopsis ?? undefined,
    coverStatus: row.cover_status,
    cover: row.cover ?? undefined,
    coverError: row.cover_error ?? undefined,
    error: row.error ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

class MemoryStore {
  projects = new Map<string, BookProject>();
  jobs = new Map<string, GenerationJob>();
}

declare global {
  var __folioMemoryStore: MemoryStore | undefined;
}

const memory =
  globalThis.__folioMemoryStore ??
  (globalThis.__folioMemoryStore = new MemoryStore());

/** In-process abort for the currently running OpenAI request for a project (same Node instance). */
const generationAbortControllers = new Map<string, AbortController>();

export class ContextStore {
  private get persistent(): boolean {
    return hasDatabaseUrl();
  }

  async createProject(
    input: ProjectInput,
    userId?: string,
    plan: SubscriptionPlan = ACTIVE_DEVELOPMENT_PLAN
  ): Promise<BookProject> {
    const targetWords = LENGTH_TARGET_WORDS[input.preferences.length];
    const expectedBatches = Math.max(1, Math.round(targetWords / WORDS_PER_BATCH));
    const now = new Date().toISOString();
    const projectPlan = normalizePlan(plan);
    const project: BookProject = {
      id: makeId(),
      userId,
      plan: projectPlan,
      input,
      status: "queued",
      batches: [],
      events: [],
      targetWords,
      totalWords: 0,
      expectedBatches,
      coverStatus: "pending",
      createdAt: now,
      updatedAt: now,
    };

    if (!this.persistent) {
      memory.projects.set(project.id, project);
      return project;
    }

    const sql = getSql();
    await sql`
      insert into projects (
        id, user_id, plan, input, status, target_words, total_words, expected_batches,
        cover_status, created_at, updated_at
      ) values (
        ${project.id}, ${userId ?? null}, ${projectPlan}, ${JSON.stringify(input)}::jsonb, ${project.status},
        ${targetWords}, 0, ${expectedBatches}, ${project.coverStatus},
        ${now}, ${now}
      )
    `;
    return project;
  }

  async getProject(id: string): Promise<BookProject | undefined> {
    if (!this.persistent) return memory.projects.get(id);

    const sql = getSql();
    const rows = (await sql`select * from projects where id = ${id}`) as ProjectRow[];
    const row = rows[0];
    if (!row) return undefined;

    const [batchRows, eventRows] = await Promise.all([
      sql`
        select * from book_batches
        where project_id = ${id}
        order by batch_number asc
      ` as unknown as Promise<BatchRow[]>,
      sql`
        select event, timestamp from generation_events
        where project_id = ${id}
        order by timestamp asc, id asc
      ` as unknown as Promise<EventRow[]>,
    ]);

    return mapProject(row, batchRows.map(mapBatch), eventRows.map(mapEvent));
  }

  async getProjectForUser(
    id: string,
    userId: string
  ): Promise<BookProject | undefined> {
    const project = await this.getProject(id);
    if (!project || project.userId !== userId) return undefined;
    return project;
  }

  /**
   * Register an AbortSignal for the active generation job on this server instance.
   * Call `endGenerationSession` when the job finishes.
   */
  beginGenerationSession(projectId: string): AbortSignal {
    this.endGenerationSession(projectId);
    const ac = new AbortController();
    generationAbortControllers.set(projectId, ac);
    return ac.signal;
  }

  endGenerationSession(projectId: string): void {
    generationAbortControllers.delete(projectId);
  }

  /**
   * Abort an in-flight provider request for this project (same process only).
   */
  signalGenerationAbort(projectId: string): void {
    generationAbortControllers.get(projectId)?.abort();
  }

  getGenerationSignal(projectId: string): AbortSignal | undefined {
    return generationAbortControllers.get(projectId)?.signal;
  }

  async assertNotCancelled(projectId: string): Promise<void> {
    const p = await this.getProject(projectId);
    if (p?.status === "cancelled") {
      throw new GenerationCancelledError();
    }
  }

  async updateStatus(id: string, status: ProjectStatus, error?: string): Promise<void> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.status = status;
      if (error) p.error = error;
      p.updatedAt = now;
      return;
    }

    await getSql()`
      update projects
      set status = ${status},
          error = ${error ?? null},
          updated_at = ${now}
      where id = ${id}
    `;
  }

  async setBible(id: string, bible: StoryBible): Promise<void> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.bible = bible;
      p.expectedBatches = bible.totalBatches;
      if (!p.title) p.title = bible.title;
      if (!p.synopsis) p.synopsis = bible.synopsis;
      p.coverStatus = "pending";
      p.cover = undefined;
      p.coverError = undefined;
      p.updatedAt = now;
      return;
    }

    await getSql()`
      update projects
      set bible = ${JSON.stringify(bible)}::jsonb,
          expected_batches = ${bible.totalBatches},
          title = coalesce(title, ${bible.title}),
          synopsis = coalesce(synopsis, ${bible.synopsis}),
          cover_status = 'pending',
          cover = null,
          cover_error = null,
          updated_at = ${now}
      where id = ${id}
    `;
  }

  async appendBatch(
    id: string,
    batch: Omit<Batch, "wordCount" | "createdAt" | "batchNumber">
  ): Promise<Batch | undefined> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return undefined;
      const full: Batch = {
        ...batch,
        batchNumber: p.batches.length + 1,
        wordCount: countWords(batch.prose),
        createdAt: now,
      };
      p.batches.push(full);
      p.totalWords += full.wordCount;
      p.updatedAt = now;
      return full;
    }

    const sql = getSql();
    const numberRows = (await sql`
      select coalesce(max(batch_number), 0) + 1 as next_number
      from book_batches
      where project_id = ${id}
    `) as { next_number: number }[];
    const full: Batch = {
      ...batch,
      batchNumber: numberRows[0]?.next_number ?? 1,
      wordCount: countWords(batch.prose),
      createdAt: now,
    };

    await sql.transaction([
      sql`
        insert into book_batches (
          project_id, batch_number, chapter_number, chapter_title,
          chapter_summary, prose, word_count, created_at
        ) values (
          ${id}, ${full.batchNumber}, ${full.chapterNumber ?? null},
          ${full.chapterTitle ?? null}, ${full.chapterSummary ?? null},
          ${full.prose}, ${full.wordCount}, ${now}
        )
      `,
      sql`
        update projects
        set total_words = total_words + ${full.wordCount},
            updated_at = ${now}
        where id = ${id}
      `,
    ]);

    return full;
  }

  async appendEvent(id: string, event: Omit<BatchEvent, "timestamp">): Promise<void> {
    const timestamp = new Date().toISOString();
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.events.push({ ...event, timestamp });
      p.updatedAt = timestamp;
      return;
    }

    const sql = getSql();
    await sql.transaction([
      sql`
        insert into generation_events (project_id, event, timestamp)
        values (${id}, ${JSON.stringify(event)}::jsonb, ${timestamp})
      `,
      sql`
        update projects set updated_at = ${timestamp} where id = ${id}
      `,
    ]);
  }

  async updateMetadata(
    id: string,
    meta: { title?: string; synopsis?: string }
  ): Promise<void> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      if (meta.title && !p.title) p.title = meta.title;
      if (meta.synopsis && !p.synopsis) p.synopsis = meta.synopsis;
      p.updatedAt = now;
      return;
    }

    await getSql()`
      update projects
      set title = coalesce(title, ${meta.title ?? null}),
          synopsis = coalesce(synopsis, ${meta.synopsis ?? null}),
          updated_at = ${now}
      where id = ${id}
    `;
  }

  async updateCoverStatus(
    id: string,
    status: BookProject["coverStatus"],
    error?: string
  ): Promise<void> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.coverStatus = status;
      if (error) p.coverError = error;
      if (status !== "failed") p.coverError = undefined;
      p.updatedAt = now;
      return;
    }

    await getSql()`
      update projects
      set cover_status = ${status},
          cover_error = ${status === "failed" ? error ?? null : null},
          updated_at = ${now}
      where id = ${id}
    `;
  }

  async setCover(id: string, cover: BookCover): Promise<void> {
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.cover = cover;
      p.coverStatus = "complete";
      p.coverError = undefined;
      p.updatedAt = cover.createdAt;
      return;
    }

    await getSql()`
      update projects
      set cover = ${JSON.stringify(cover)}::jsonb,
          cover_status = 'complete',
          cover_error = null,
          updated_at = ${cover.createdAt}
      where id = ${id}
    `;
  }

  async getFullContext(id: string): Promise<FullContext | undefined> {
    const p = await this.getProject(id);
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

  async listProjects(): Promise<BookProject[]> {
    if (!this.persistent) {
      return Array.from(memory.projects.values()).sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt)
      );
    }

    const sql = getSql();
    const rows = (await sql`
      select * from projects order by created_at desc
    `) as ProjectRow[];
    const projects = await Promise.all(rows.map((row) => this.getProject(row.id)));
    return projects.filter((project): project is BookProject => Boolean(project));
  }

  async listProjectsForUser(userId: string): Promise<BookProject[]> {
    if (!this.persistent) {
      return Array.from(memory.projects.values())
        .filter((project) => project.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    const sql = getSql();
    const rows = (await sql`
      select * from projects
      where user_id = ${userId}
      order by created_at desc
    `) as ProjectRow[];
    const projects = await Promise.all(rows.map((row) => this.getProject(row.id)));
    return projects.filter((project): project is BookProject => Boolean(project));
  }

  async enqueueJob(
    projectId: string,
    type: GenerationJobType,
    options: { force?: boolean; runAfter?: string } = {}
  ): Promise<GenerationJob> {
    const now = new Date().toISOString();
    const runAfter = options.runAfter ?? now;

    if (!this.persistent) {
      if (!options.force) {
        const existing = Array.from(memory.jobs.values()).find(
          (job) =>
            job.projectId === projectId &&
            job.type === type &&
            (job.status === "queued" || job.status === "running")
        );
        if (existing) return existing;
      }
      const job: GenerationJob = {
        id: makeId(),
        projectId,
        type,
        status: "queued",
        attempts: 0,
        runAfter,
        createdAt: now,
        updatedAt: now,
      };
      memory.jobs.set(job.id, job);
      return job;
    }

    const sql = getSql();
    if (!options.force) {
      const existing = (await sql`
        select * from generation_jobs
        where project_id = ${projectId}
          and type = ${type}
          and status in ('queued', 'running')
        order by created_at asc
        limit 1
      `) as JobRow[];
      if (existing[0]) return mapJob(existing[0]);
    }

    const id = makeId();
    const rows = (await sql`
      insert into generation_jobs (id, project_id, type, status, run_after, created_at, updated_at)
      values (${id}, ${projectId}, ${type}, 'queued', ${runAfter}, ${now}, ${now})
      returning *
    `) as JobRow[];
    return mapJob(rows[0]);
  }

  async claimNextJob(): Promise<GenerationJob | undefined> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const staleMs = Date.now() - 10 * 60 * 1000;
      const job = Array.from(memory.jobs.values())
        .filter(
          (candidate) =>
            candidate.status === "queued" ||
            (candidate.status === "running" &&
              candidate.lockedAt &&
              new Date(candidate.lockedAt).getTime() < staleMs)
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (!job) return undefined;
      job.status = "running";
      job.attempts += 1;
      job.lockedAt = now;
      job.startedAt = job.startedAt ?? now;
      job.updatedAt = now;
      return job;
    }

    const sql = getSql();
    const rows = (await sql`
      update generation_jobs
      set status = 'running',
          attempts = attempts + 1,
          locked_at = ${now},
          started_at = coalesce(started_at, ${now}),
          updated_at = ${now}
      where id = (
        select id from generation_jobs
        where (
          status = 'queued' and run_after <= now()
        ) or (
          status = 'running' and locked_at < now() - interval '10 minutes'
        )
        order by created_at asc
        limit 1
      )
      and (
        status = 'queued'
        or (status = 'running' and locked_at < now() - interval '10 minutes')
      )
      returning *
    `) as JobRow[];
    return rows[0] ? mapJob(rows[0]) : undefined;
  }

  async completeJob(jobId: string): Promise<void> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const job = memory.jobs.get(jobId);
      if (!job) return;
      job.status = "complete";
      job.completedAt = now;
      job.updatedAt = now;
      return;
    }
    await getSql()`
      update generation_jobs
      set status = 'complete',
          completed_at = ${now},
          updated_at = ${now}
      where id = ${jobId}
    `;
  }

  /**
   * Stop generation: mark project cancelled, fail queued/running jobs, abort in-flight HTTP to the model.
   */
  async cancelProjectForUser(
    projectId: string,
    userId: string
  ): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
    const project = await this.getProjectForUser(projectId, userId);
    if (!project) {
      const exists = await this.getProject(projectId);
      if (!exists) return { ok: false, reason: "not_found" };
      return { ok: false, reason: "forbidden" };
    }
    if (
      project.status === "complete" ||
      project.status === "failed" ||
      project.status === "cancelled"
    ) {
      return { ok: true };
    }

    this.signalGenerationAbort(projectId);
    const now = new Date().toISOString();
    await this.updateStatus(projectId, "cancelled", "Generation stopped.");
    if (!this.persistent) {
      for (const [, job] of memory.jobs) {
        if (
          job.projectId === projectId &&
          (job.status === "queued" || job.status === "running")
        ) {
          job.status = "failed";
          job.error = "Cancelled";
          job.completedAt = now;
          job.updatedAt = now;
        }
      }
    } else {
      await getSql()`
        update generation_jobs
        set status = 'failed',
            error = 'Cancelled',
            completed_at = ${now},
            updated_at = ${now}
        where project_id = ${projectId}
          and status in ('queued', 'running')
      `;
    }
    await this.appendEvent(projectId, { type: "project_cancelled" });
    return { ok: true };
  }

  async deleteProjectForUser(
    projectId: string,
    userId: string
  ): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
    const project = await this.getProjectForUser(projectId, userId);
    if (!project) {
      const exists = await this.getProject(projectId);
      if (!exists) return { ok: false, reason: "not_found" };
      return { ok: false, reason: "forbidden" };
    }

    this.signalGenerationAbort(projectId);
    this.endGenerationSession(projectId);

    if (!this.persistent) {
      memory.projects.delete(projectId);
      for (const [jid, job] of memory.jobs) {
        if (job.projectId === projectId) memory.jobs.delete(jid);
      }
      return { ok: true };
    }

    await getSql()`delete from projects where id = ${projectId} and user_id = ${userId}`;
    return { ok: true };
  }

  async failJob(jobId: string, error: string): Promise<void> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const job = memory.jobs.get(jobId);
      if (!job) return;
      job.status = "failed";
      job.error = error;
      job.completedAt = now;
      job.updatedAt = now;
      return;
    }
    await getSql()`
      update generation_jobs
      set status = 'failed',
          error = ${error},
          completed_at = ${now},
          updated_at = ${now}
      where id = ${jobId}
    `;
  }
}

export const store = new ContextStore();
