import { getSql, hasDatabaseUrl } from "@/lib/db/postgres";
import { syncBookToNotion } from "@/lib/notion/book-sync";
import {
  FALLBACK_PROJECT_PLAN,
  normalizePlan,
  type SubscriptionPlan,
} from "@/lib/plans";
import { GenerationCancelledError } from "./generation-errors";
import {
  createPipelineConfig,
  normalizePipelineConfig,
  PIPELINE_VERSION,
  type ProjectPipelineConfig,
} from "./model-config";
import type {
  Batch,
  BatchEvent,
  BookCover,
  BookProject,
  FullContext,
  GenerationJob,
  GenerationJobPayload,
  GenerationJobType,
  LengthPreset,
  ProjectInput,
  ProjectStatus,
  StateDelta,
  StoryBible,
  StoryState,
} from "./types";
import { emptyStoryState } from "./types";
import {
  normalizeStateDelta,
  normalizeStoryState,
  rebuildStoryStateFromDeltas,
} from "./story-state";
import type { LlmRole } from "./openai-client";

/** Max attempts before a poison job is permanently failed (stale reclaim still allowed until then). */
export const MAX_JOB_ATTEMPTS = 3;

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
  user_email?: string | null;
  plan: string | null;
  input: ProjectInput;
  status: ProjectStatus;
  target_words: number;
  total_words: number;
  expected_batches: number;
  title: string | null;
  synopsis: string | null;
  bible: StoryBible | null;
  story_state: StoryState | null;
  pipeline_version: string | null;
  model_config: ProjectPipelineConfig | null;
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
  open_threads: unknown;
  state_delta: unknown;
  last_revision_key: string | null;
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
  payload: GenerationJobPayload | null;
  dedupe_key: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

function coerceOpenThreads(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  // JSONB may arrive as a parsed string already, or as { text: "..." }
  if (typeof value === "object" && value !== null && "text" in value) {
    const text = (value as { text?: unknown }).text;
    return typeof text === "string" ? text : undefined;
  }
  try {
    return String(value);
  } catch {
    return undefined;
  }
}

function mapBatch(row: BatchRow): Batch {
  return {
    batchNumber: row.batch_number,
    chapterNumber: row.chapter_number ?? undefined,
    chapterTitle: row.chapter_title ?? undefined,
    chapterSummary: row.chapter_summary ?? undefined,
    openThreads: coerceOpenThreads(row.open_threads),
    stateDelta: normalizeStateDelta(row.state_delta, row.batch_number) ?? undefined,
    lastRevisionKey: row.last_revision_key ?? undefined,
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
    payload: row.payload ?? undefined,
    dedupeKey: row.dedupe_key ?? undefined,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function mapProject(row: ProjectRow, batches: Batch[], events: BatchEvent[]): BookProject {
  const plan = normalizePlan(row.plan);
  const modelConfig = normalizePipelineConfig(
    row.model_config ??
      (row.pipeline_version
        ? { pipelineVersion: row.pipeline_version }
        : undefined),
    plan
  );
  return {
    id: row.id,
    userId: row.user_id ?? undefined,
    userEmail: row.user_email ?? undefined,
    plan,
    input: row.input,
    status: row.status,
    bible: row.bible
      ? { ...row.bible, threadLedger: row.bible.threadLedger ?? [] }
      : undefined,
    storyState: normalizeStoryState(row.story_state ?? emptyStoryState()),
    pipelineVersion: row.pipeline_version ?? modelConfig.pipelineVersion,
    modelConfig,
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
  llmUsage: {
    id: number;
    projectId: string;
    role: string;
    model: string;
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
    operation?: string;
    jobId?: string;
    durationMs?: number;
    requestId?: string;
    estimated?: boolean;
    createdAt: string;
  }[] = [];
  nextUsageId = 1;
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

  private syncProjectToNotion(projectId: string): void {
    void this.getProject(projectId)
      .then((project) => {
        if (project) return syncBookToNotion(project);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[notion-sync] ${projectId}: ${message}`);
      });
  }

  async createProject(
    input: ProjectInput,
    userId?: string,
    plan: SubscriptionPlan = FALLBACK_PROJECT_PLAN
  ): Promise<BookProject> {
    const targetWords = LENGTH_TARGET_WORDS[input.preferences.length];
    const expectedBatches = Math.max(1, Math.round(targetWords / WORDS_PER_BATCH));
    const now = new Date().toISOString();
    const projectPlan = normalizePlan(plan);
    const modelConfig = createPipelineConfig(projectPlan);
    const project: BookProject = {
      id: makeId(),
      userId,
      plan: projectPlan,
      input,
      status: "queued",
      storyState: emptyStoryState(),
      pipelineVersion: PIPELINE_VERSION,
      modelConfig,
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
      this.syncProjectToNotion(project.id);
      return project;
    }

    const sql = getSql();
    await sql`
      insert into projects (
        id, user_id, plan, input, status, target_words, total_words, expected_batches,
        cover_status, pipeline_version, model_config, created_at, updated_at
      ) values (
        ${project.id}, ${userId ?? null}, ${projectPlan}, ${JSON.stringify(input)}::jsonb, ${project.status},
        ${targetWords}, 0, ${expectedBatches}, ${project.coverStatus},
        ${PIPELINE_VERSION}, ${JSON.stringify(modelConfig)}::jsonb,
        ${now}, ${now}
      )
    `;
    this.syncProjectToNotion(project.id);
    return project;
  }

  async getProject(id: string): Promise<BookProject | undefined> {
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return undefined;
      if (!p.modelConfig) {
        p.modelConfig = normalizePipelineConfig(undefined, p.plan);
        p.pipelineVersion = p.pipelineVersion ?? p.modelConfig.pipelineVersion;
      }
      if (p.bible && !p.bible.threadLedger) p.bible.threadLedger = [];
      p.storyState = normalizeStoryState(p.storyState);
      return p;
    }

    const sql = getSql();
    const rows = (await sql`
      select p.*, u.email as user_email
      from projects p
      left join users u on u.id = p.user_id
      where p.id = ${id}
    `) as ProjectRow[];
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

  /**
   * Persist a deterministic model snapshot for legacy rows exactly once.
   * Concurrent callers converge on whichever conditional update wins; every
   * caller then returns the stored value rather than its local candidate.
   */
  async ensureProjectPipelineConfig(
    projectId: string
  ): Promise<ProjectPipelineConfig | undefined> {
    if (!this.persistent) {
      const project = memory.projects.get(projectId);
      if (!project) return undefined;
      if (!project.modelConfig) {
        project.modelConfig = normalizePipelineConfig(undefined, project.plan);
      }
      project.pipelineVersion =
        project.pipelineVersion ?? project.modelConfig.pipelineVersion;
      return project.modelConfig;
    }

    const sql = getSql();
    const rows = (await sql`
      select plan, pipeline_version, model_config
      from projects
      where id = ${projectId}
    `) as {
      plan: string | null;
      pipeline_version: string | null;
      model_config: ProjectPipelineConfig | null;
    }[];
    const row = rows[0];
    if (!row) return undefined;
    if (row.model_config) {
      return normalizePipelineConfig(row.model_config, normalizePlan(row.plan));
    }

    const candidate = normalizePipelineConfig(
      row.pipeline_version
        ? { pipelineVersion: row.pipeline_version }
        : undefined,
      normalizePlan(row.plan)
    );
    const persisted = (await sql`
      update projects
      set model_config = coalesce(
            model_config,
            ${JSON.stringify(candidate)}::jsonb
          ),
          pipeline_version = coalesce(
            pipeline_version,
            ${candidate.pipelineVersion}
          )
      where id = ${projectId}
      returning model_config, pipeline_version
    `) as {
      model_config: ProjectPipelineConfig;
      pipeline_version: string | null;
    }[];
    if (!persisted[0]?.model_config) return undefined;
    return normalizePipelineConfig(
      persisted[0].model_config,
      normalizePlan(row.plan)
    );
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
      this.syncProjectToNotion(id);
      return;
    }

    await getSql()`
      update projects
      set status = ${status},
          error = ${error ?? null},
          updated_at = ${now}
      where id = ${id}
    `;
    this.syncProjectToNotion(id);
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
      this.syncProjectToNotion(id);
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
    this.syncProjectToNotion(id);
  }

  /**
   * Idempotent batch insert at absolute batchNumber.
   * Returns { batch, inserted }. total_words increases only when inserted.
   */
  async appendBatch(
    id: string,
    batch: Omit<Batch, "wordCount" | "createdAt"> & { batchNumber: number }
  ): Promise<{ batch: Batch; inserted: boolean } | undefined> {
    const now = new Date().toISOString();
    const wordCount = countWords(batch.prose);
    const stateDelta = normalizeStateDelta(batch.stateDelta, batch.batchNumber);

    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return undefined;
      const existing = p.batches.find((b) => b.batchNumber === batch.batchNumber);
      if (existing) {
        return { batch: existing, inserted: false };
      }
      const full: Batch = {
        ...batch,
        stateDelta: stateDelta ?? undefined,
        wordCount,
        createdAt: now,
      };
      p.batches.push(full);
      p.batches.sort((a, b) => a.batchNumber - b.batchNumber);
      p.totalWords += full.wordCount;
      p.updatedAt = now;
      this.syncProjectToNotion(id);
      return { batch: full, inserted: true };
    }

    const sql = getSql();
    const openThreadsJson =
      batch.openThreads != null ? JSON.stringify(batch.openThreads) : null;
    const stateDeltaJson =
      stateDelta != null ? JSON.stringify(stateDelta) : null;

    // One statement: project total advances iff this statement inserted the batch.
    // A replay produces no `inserted` row, so `updated_project` is also a no-op.
    const insertedRows = (await sql`
      with inserted as (
        insert into book_batches (
          project_id, batch_number, chapter_number, chapter_title,
          chapter_summary, prose, word_count, open_threads, state_delta, created_at
        ) values (
          ${id}, ${batch.batchNumber}, ${batch.chapterNumber ?? null},
          ${batch.chapterTitle ?? null}, ${batch.chapterSummary ?? null},
          ${batch.prose}, ${wordCount},
          ${openThreadsJson}::jsonb, ${stateDeltaJson}::jsonb, ${now}
        )
        on conflict (project_id, batch_number) do nothing
        returning *
      ),
      updated_project as (
        update projects p
        set total_words = p.total_words + inserted.word_count,
            updated_at = ${now}
        from inserted
        where p.id = ${id}
        returning p.id
      )
      select inserted.* from inserted
    `) as BatchRow[];

    if (insertedRows[0]) {
      this.syncProjectToNotion(id);
      return { batch: mapBatch(insertedRows[0]), inserted: true };
    }

    const existing = (await sql`
      select * from book_batches
      where project_id = ${id} and batch_number = ${batch.batchNumber}
    `) as BatchRow[];
    if (!existing[0]) return undefined;
    this.syncProjectToNotion(id);
    return { batch: mapBatch(existing[0]), inserted: false };
  }

  /**
   * Replace batch prose + state_delta + optional revision key atomically.
   * If revisionKey matches last_revision_key, returns existing without mutation.
   */
  async replaceBatch(
    id: string,
    batchNumber: number,
    update: {
      prose: string;
      chapterSummary?: string;
      openThreads?: string;
      stateDelta?: StateDelta;
      revisionKey?: string;
    }
  ): Promise<{ batch: Batch; applied: boolean } | undefined> {
    const now = new Date().toISOString();
    const newWordCount = countWords(update.prose);
    const stateDelta = normalizeStateDelta(update.stateDelta, batchNumber);

    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return undefined;
      const idx = p.batches.findIndex((b) => b.batchNumber === batchNumber);
      if (idx < 0) return undefined;
      const prev = p.batches[idx];
      if (
        update.revisionKey &&
        prev.lastRevisionKey &&
        prev.lastRevisionKey === update.revisionKey
      ) {
        return { batch: prev, applied: false };
      }
      const next: Batch = {
        ...prev,
        prose: update.prose,
        chapterSummary: update.chapterSummary ?? prev.chapterSummary,
        openThreads: update.openThreads ?? prev.openThreads,
        stateDelta: stateDelta ?? prev.stateDelta,
        lastRevisionKey: update.revisionKey ?? prev.lastRevisionKey,
        wordCount: newWordCount,
      };
      p.totalWords = p.totalWords - prev.wordCount + newWordCount;
      p.batches[idx] = next;
      p.updatedAt = now;
      this.syncProjectToNotion(id);
      return { batch: next, applied: true };
    }

    const sql = getSql();
    const openThreadsJson =
      update.openThreads != null
        ? JSON.stringify(update.openThreads)
        : null;
    const stateDeltaJson =
      stateDelta != null
        ? JSON.stringify(stateDelta)
        : null;

    // Lock/read/update batch and apply its exact word delta to the project in one
    // statement. A matching revision key yields no `updated_batch` row, so both
    // manuscript and total_words remain unchanged under replay or concurrency.
    const updatedRows = (await sql`
      with current_batch as materialized (
        select *
        from book_batches
        where project_id = ${id} and batch_number = ${batchNumber}
        for update
      ),
      updated_batch as (
        update book_batches b
        set prose = ${update.prose},
            chapter_summary = coalesce(
              ${update.chapterSummary ?? null}::text,
              current_batch.chapter_summary
            ),
            open_threads = case
              when ${update.openThreads ?? null}::text is null
                then current_batch.open_threads
              else ${openThreadsJson}::jsonb
            end,
            state_delta = case
              when ${stateDeltaJson}::text is null
                then current_batch.state_delta
              else ${stateDeltaJson}::jsonb
            end,
            last_revision_key = coalesce(
              ${update.revisionKey ?? null}::text,
              current_batch.last_revision_key
            ),
            word_count = ${newWordCount}
        from current_batch
        where b.project_id = current_batch.project_id
          and b.batch_number = current_batch.batch_number
          and (
            ${update.revisionKey ?? null}::text is null
            or current_batch.last_revision_key is distinct from ${update.revisionKey ?? null}
          )
        returning b.*, (${newWordCount} - current_batch.word_count) as word_delta
      ),
      updated_project as (
        update projects p
        set total_words = p.total_words + updated_batch.word_delta,
            updated_at = ${now}
        from updated_batch
        where p.id = ${id}
        returning p.id
      )
      select
        updated_batch.batch_number,
        updated_batch.chapter_number,
        updated_batch.chapter_title,
        updated_batch.chapter_summary,
        updated_batch.open_threads,
        updated_batch.state_delta,
        updated_batch.last_revision_key,
        updated_batch.prose,
        updated_batch.word_count,
        updated_batch.created_at
      from updated_batch
    `) as BatchRow[];
    this.syncProjectToNotion(id);

    if (updatedRows[0]) {
      return { batch: mapBatch(updatedRows[0]), applied: true };
    }

    const after = (await sql`
      select * from book_batches
      where project_id = ${id} and batch_number = ${batchNumber}
    `) as BatchRow[];
    if (!after[0]) return undefined;
    const mapped = mapBatch(after[0]);
    return { batch: mapped, applied: false };
  }

  async setStoryState(id: string, storyState: StoryState): Promise<void> {
    const now = new Date().toISOString();
    const normalized = normalizeStoryState(storyState);
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.storyState = normalized;
      p.updatedAt = now;
      return;
    }
    await getSql()`
      update projects
      set story_state = ${JSON.stringify(normalized)}::jsonb,
          updated_at = ${now}
      where id = ${id}
    `;
  }

  /** Rebuild canonical StoryState from all stored batch state_deltas. */
  async rebuildStoryState(projectId: string): Promise<StoryState> {
    const project = await this.getProject(projectId);
    if (!project) return emptyStoryState();
    const rebuilt = rebuildStoryStateFromDeltas(
      project.batches.map((b) => ({
        batchNumber: b.batchNumber,
        stateDelta: b.stateDelta,
      }))
    );
    await this.setStoryState(projectId, rebuilt);
    return rebuilt;
  }

  /** @deprecated Prefer rebuildStoryState after accepted writes/revisions. */
  async mergeStoryState(id: string, delta: StateDelta | undefined | null): Promise<StoryState> {
    void delta;
    return this.rebuildStoryState(id);
  }

  /**
   * Best-effort usage metering. Never throws — generation must not fail on metering.
   */
  async recordLlmUsage(
    projectId: string,
    role: LlmRole | string,
    model: string,
    usage: {
      inputTokens?: number;
      cachedInputTokens?: number;
      cacheWriteTokens?: number;
      outputTokens?: number;
      operation?: string;
      jobId?: string;
      durationMs?: number;
      requestId?: string;
      estimated?: boolean;
    }
  ): Promise<void> {
    try {
      const inputTokens = usage.inputTokens ?? 0;
      const cachedInputTokens = usage.cachedInputTokens ?? 0;
      const cacheWriteTokens = usage.cacheWriteTokens ?? 0;
      const outputTokens = usage.outputTokens ?? 0;
      const now = new Date().toISOString();

      if (!this.persistent) {
        memory.llmUsage.push({
          id: memory.nextUsageId++,
          projectId,
          role,
          model,
          inputTokens,
          cachedInputTokens,
          cacheWriteTokens,
          outputTokens,
          operation: usage.operation,
          jobId: usage.jobId,
          durationMs: usage.durationMs,
          requestId: usage.requestId,
          estimated: usage.estimated,
          createdAt: now,
        });
        return;
      }

      await getSql()`
        insert into llm_usage (
          project_id, role, model, input_tokens, cached_input_tokens, cache_write_tokens,
          output_tokens, operation, job_id, duration_ms, request_id, estimated, created_at
        ) values (
          ${projectId}, ${role}, ${model},
          ${inputTokens}, ${cachedInputTokens}, ${cacheWriteTokens},
          ${outputTokens}, ${usage.operation ?? null}, ${usage.jobId ?? null},
          ${usage.durationMs ?? null}, ${usage.requestId ?? null},
          ${usage.estimated ?? false}, ${now}
        )
      `;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[llm-usage] failed to record for ${projectId}: ${message}`);
    }
  }

  async appendEvent(id: string, event: Omit<BatchEvent, "timestamp">): Promise<void> {
    const timestamp = new Date().toISOString();
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.events.push({ ...event, timestamp });
      p.updatedAt = timestamp;
      this.syncProjectToNotion(id);
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
    this.syncProjectToNotion(id);
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
      this.syncProjectToNotion(id);
      return;
    }

    await getSql()`
      update projects
      set title = coalesce(title, ${meta.title ?? null}),
          synopsis = coalesce(synopsis, ${meta.synopsis ?? null}),
          updated_at = ${now}
      where id = ${id}
    `;
    this.syncProjectToNotion(id);
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
      this.syncProjectToNotion(id);
      return;
    }

    await getSql()`
      update projects
      set cover_status = ${status},
          cover_error = ${status === "failed" ? error ?? null : null},
          updated_at = ${now}
      where id = ${id}
    `;
    this.syncProjectToNotion(id);
  }

  async setCover(id: string, cover: BookCover): Promise<void> {
    if (!this.persistent) {
      const p = memory.projects.get(id);
      if (!p) return;
      p.cover = cover;
      p.coverStatus = "complete";
      p.coverError = undefined;
      p.updatedAt = cover.createdAt;
      this.syncProjectToNotion(id);
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
    this.syncProjectToNotion(id);
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
      select p.*, u.email as user_email
      from projects p
      left join users u on u.id = p.user_id
      order by p.created_at desc
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
      select p.*, u.email as user_email
      from projects p
      left join users u on u.id = p.user_id
      where p.user_id = ${userId}
      order by p.created_at desc
    `) as ProjectRow[];
    const projects = await Promise.all(rows.map((row) => this.getProject(row.id)));
    return projects.filter((project): project is BookProject => Boolean(project));
  }

  async enqueueJob(
    projectId: string,
    type: GenerationJobType,
    options: {
      force?: boolean;
      runAfter?: string;
      payload?: GenerationJobPayload;
      dedupeKey?: string;
    } = {}
  ): Promise<GenerationJob> {
    const now = new Date().toISOString();
    const runAfter = options.runAfter ?? now;
    const payload = options.payload;
    const dedupeKey = options.dedupeKey;

    if (!this.persistent) {
      if (dedupeKey) {
        const byKey = Array.from(memory.jobs.values()).find(
          (job) => job.projectId === projectId && job.dedupeKey === dedupeKey
        );
        if (byKey) return byKey;
      }
      if (!options.force && !dedupeKey) {
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
        payload,
        dedupeKey,
        createdAt: now,
        updatedAt: now,
      };
      memory.jobs.set(job.id, job);
      return job;
    }

    const sql = getSql();
    if (dedupeKey) {
      const byKey = (await sql`
        select * from generation_jobs
        where project_id = ${projectId}
          and dedupe_key = ${dedupeKey}
        limit 1
      `) as JobRow[];
      if (byKey[0]) return mapJob(byKey[0]);
    }

    if (!options.force && !dedupeKey) {
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
    const payloadJson = payload != null ? JSON.stringify(payload) : null;
    try {
      const rows = (await sql`
        insert into generation_jobs (
          id, project_id, type, status, run_after, payload, dedupe_key, created_at, updated_at
        )
        values (
          ${id}, ${projectId}, ${type}, 'queued', ${runAfter},
          ${payloadJson}::jsonb, ${dedupeKey ?? null}, ${now}, ${now}
        )
        returning *
      `) as JobRow[];
      return mapJob(rows[0]);
    } catch (err) {
      // Unique (project_id, dedupe_key) race — reuse existing
      if (dedupeKey) {
        const byKey = (await sql`
          select * from generation_jobs
          where project_id = ${projectId}
            and dedupe_key = ${dedupeKey}
          limit 1
        `) as JobRow[];
        if (byKey[0]) return mapJob(byKey[0]);
      }
      throw err;
    }
  }

  /**
   * Mark exhausted queued/stale-running jobs failed and return them for
   * centralized project recovery. Bounded and idempotent: only rows transitioning
   * from queued/running are returned.
   */
  async reapExhaustedJobs(
    userId?: string,
    projectId?: string
  ): Promise<GenerationJob[]> {
    const now = new Date().toISOString();
    const error = `Exceeded maximum attempts (${MAX_JOB_ATTEMPTS})`;
    if (!this.persistent) {
      const staleMs = Date.now() - 6 * 60 * 1000;
      const exhausted: GenerationJob[] = [];
      for (const candidate of memory.jobs.values()) {
        if (exhausted.length >= 20) break;
        if (projectId && candidate.projectId !== projectId) continue;
        const project = memory.projects.get(candidate.projectId);
        if (userId && project?.userId !== userId) continue;
        const eligible =
          candidate.attempts >= MAX_JOB_ATTEMPTS &&
          (candidate.status === "queued" ||
            (candidate.status === "running" &&
              !!candidate.lockedAt &&
              new Date(candidate.lockedAt).getTime() < staleMs));
        if (!eligible) continue;
        candidate.status = "failed";
        candidate.error = candidate.error ?? error;
        candidate.completedAt = candidate.completedAt ?? now;
        candidate.updatedAt = now;
        exhausted.push({ ...candidate });
      }
      return exhausted;
    }

    if (projectId) {
      const scoped = (await getSql()`
        update generation_jobs
        set status = 'failed',
            error = coalesce(error, ${error}),
            completed_at = coalesce(completed_at, ${now}),
            updated_at = ${now}
        where id in (
          select id
          from generation_jobs
          where project_id = ${projectId}
            and attempts >= ${MAX_JOB_ATTEMPTS}
            and (
              status = 'queued'
              or (status = 'running' and locked_at < now() - interval '6 minutes')
            )
          order by created_at asc
          limit 20
        )
        returning *
      `) as JobRow[];
      return scoped.map(mapJob);
    }

    const rows = userId
      ? ((await getSql()`
          update generation_jobs
          set status = 'failed',
              error = coalesce(error, ${error}),
              completed_at = coalesce(completed_at, ${now}),
              updated_at = ${now}
          where id in (
            select gj.id
            from generation_jobs gj
            where gj.attempts >= ${MAX_JOB_ATTEMPTS}
              and (
                gj.status = 'queued'
                or (
                  gj.status = 'running'
                  and gj.locked_at < now() - interval '6 minutes'
                )
              )
              and exists (
                select 1 from projects p
                where p.id = gj.project_id and p.user_id = ${userId}
              )
            order by gj.created_at asc
            limit 20
          )
          returning *
        `) as JobRow[])
      : ((await getSql()`
          update generation_jobs
          set status = 'failed',
              error = coalesce(error, ${error}),
              completed_at = coalesce(completed_at, ${now}),
              updated_at = ${now}
          where id in (
            select id
            from generation_jobs
            where attempts >= ${MAX_JOB_ATTEMPTS}
              and (
                status = 'queued'
                or (
                  status = 'running'
                  and locked_at < now() - interval '6 minutes'
                )
              )
            order by created_at asc
            limit 20
          )
          returning *
        `) as JobRow[]);
    return rows.map(mapJob);
  }

  async claimNextJob(
    userId?: string,
    projectId?: string
  ): Promise<GenerationJob | undefined> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const staleMs = Date.now() - 6 * 60 * 1000;
      const job = Array.from(memory.jobs.values())
        .filter((candidate) => {
          if (projectId && candidate.projectId !== projectId) return false;
          const project = memory.projects.get(candidate.projectId);
          if (userId && project?.userId !== userId) return false;
          if (candidate.attempts >= MAX_JOB_ATTEMPTS) return false;
          return (
            candidate.status === "queued" ||
            (candidate.status === "running" &&
              candidate.lockedAt &&
              new Date(candidate.lockedAt).getTime() < staleMs)
          );
        })
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
    // Project-scoped claiming lets two runs share one queue without stealing
    // each other's jobs — used by the A/B harness, and by any future per-project
    // worker. A project belongs to exactly one user, so projectId subsumes userId.
    if (projectId) {
      const scoped = (await sql`
        update generation_jobs
        set status = 'running',
            attempts = attempts + 1,
            locked_at = ${now},
            started_at = coalesce(started_at, ${now}),
            updated_at = ${now}
        where id = (
          select id from generation_jobs
          where project_id = ${projectId}
          and attempts < ${MAX_JOB_ATTEMPTS}
          and (
            (status = 'queued' and run_after <= now())
            or (status = 'running' and locked_at < now() - interval '6 minutes')
          )
          order by created_at asc
          limit 1
        )
        and (
          status = 'queued'
          or (status = 'running' and locked_at < now() - interval '6 minutes')
        )
        returning *
      `) as JobRow[];
      return scoped[0] ? mapJob(scoped[0]) : undefined;
    }

    if (userId) {
      const rows = (await sql`
        update generation_jobs
        set status = 'running',
            attempts = attempts + 1,
            locked_at = ${now},
            started_at = coalesce(started_at, ${now}),
            updated_at = ${now}
        where id = (
          select gj.id from generation_jobs gj
          where gj.attempts < ${MAX_JOB_ATTEMPTS}
          and (
            (gj.status = 'queued' and gj.run_after <= now())
            or (gj.status = 'running' and gj.locked_at < now() - interval '6 minutes')
          )
          and exists (
            select 1 from projects p
            where p.id = gj.project_id and p.user_id = ${userId}
          )
          order by gj.created_at asc
          limit 1
        )
        and (
          status = 'queued'
          or (status = 'running' and locked_at < now() - interval '6 minutes')
        )
        returning *
      `) as JobRow[];
      return rows[0] ? mapJob(rows[0]) : undefined;
    }

    // The global runner — this is the cron, and it serves every account, so it
    // is the only place fairness can live. Ordering purely by created_at lets
    // whoever queued first hold the worker for their entire book while everyone
    // else waits on chapter one. Preferring accounts with the fewest jobs
    // already running turns that into a round robin: a user with nothing in
    // flight is always served before a user who is mid-book. Within one
    // account, and between equally-busy accounts, it stays first-come.
    const rows = (await sql`
      update generation_jobs
      set status = 'running',
          attempts = attempts + 1,
          locked_at = ${now},
          started_at = coalesce(started_at, ${now}),
          updated_at = ${now}
      where id = (
        select gj.id
        from generation_jobs gj
        left join projects p on p.id = gj.project_id
        where gj.attempts < ${MAX_JOB_ATTEMPTS}
        and (
          (gj.status = 'queued' and gj.run_after <= now())
          or (gj.status = 'running' and gj.locked_at < now() - interval '6 minutes')
        )
        order by (
          select count(*)
          from generation_jobs busy
          join projects bp on bp.id = busy.project_id
          where busy.status = 'running'
            and busy.locked_at >= now() - interval '6 minutes'
            and bp.user_id is not distinct from p.user_id
        ) asc,
        gj.created_at asc
        limit 1
      )
      and (
        status = 'queued'
        or (status = 'running' and locked_at < now() - interval '6 minutes')
      )
      returning *
    `) as JobRow[];
    return rows[0] ? mapJob(rows[0]) : undefined;
  }

  /**
   * Put a project's failed and stale-running jobs back on the queue.
   *
   * enqueueJob returns the existing row whenever a dedupe key is already
   * present, so a book that died on something transient — an API outage, an
   * exhausted account balance, a closed laptop — cannot be restarted by
   * enqueuing again. The rows carrying its keys have to be reset. Safe to call
   * repeatedly: every job type is idempotent on replay, and work already
   * finished is skipped without a model call.
   */
  async requeueFailedJobs(projectId: string): Promise<number> {
    const now = new Date().toISOString();
    if (!this.persistent) {
      const staleMs = Date.now() - 6 * 60 * 1000;
      let count = 0;
      for (const job of memory.jobs.values()) {
        if (job.projectId !== projectId) continue;
        const stuck =
          job.status === "failed" ||
          (job.status === "running" &&
            !!job.lockedAt &&
            new Date(job.lockedAt).getTime() < staleMs);
        if (!stuck) continue;
        job.status = "queued";
        job.attempts = 0;
        job.error = undefined;
        job.lockedAt = undefined;
        job.completedAt = undefined;
        job.runAfter = now;
        job.updatedAt = now;
        count++;
      }
      return count;
    }

    const rows = (await getSql()`
      update generation_jobs
      set status = 'queued',
          attempts = 0,
          error = null,
          locked_at = null,
          completed_at = null,
          run_after = ${now},
          updated_at = ${now}
      where project_id = ${projectId}
        and (
          status = 'failed'
          or (status = 'running' and locked_at < now() - interval '6 minutes')
        )
      returning id
    `) as { id: string }[];
    return rows.length;
  }

  /**
   * Books this user currently has in flight.
   *
   * "In flight" excludes awaiting_approval: a plan sitting at the human gate
   * consumes no worker and may wait days, so counting it would let a forgotten
   * draft permanently block someone's next book.
   */
  async countActiveProjectsForUser(userId: string): Promise<number> {
    const active = new Set(["pending", "queued", "planning", "writing"]);
    if (!this.persistent) {
      return Array.from(memory.projects.values()).filter(
        (p) => p.userId === userId && active.has(p.status)
      ).length;
    }
    const rows = (await getSql()`
      select count(*)::int as n
      from projects
      where user_id = ${userId}
        and status in ('pending', 'queued', 'planning', 'writing')
    `) as { n: number }[];
    return rows[0]?.n ?? 0;
  }

  /** For UI: job queue / lock state while diagnosing stuck planning. */
  async listGenerationJobsForProject(projectId: string): Promise<GenerationJob[]> {
    if (!this.persistent) {
      return Array.from(memory.jobs.values())
        .filter((j) => j.projectId === projectId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .slice(-8)
        .reverse();
    }
    const rows = (await getSql()`
      select * from generation_jobs
      where project_id = ${projectId}
      order by created_at desc
      limit 8
    `) as JobRow[];
    return rows.map(mapJob);
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
