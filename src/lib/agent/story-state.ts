import type {
  StateDelta,
  StoryState,
  StoryStateThread,
  ThreadOpened,
  ThreadResolved,
} from "./types";

export const STORY_STATE_FACT_CAP = 40;
export const STORY_STATE_THREAD_CAP = 24;

export function emptyStoryState(): StoryState {
  return { facts: [], characters: [], openThreads: [] };
}

/** Normalize legacy string[] openThreads into structured threads. */
export function normalizeOpenThreads(
  threads: unknown
): StoryStateThread[] {
  if (!Array.isArray(threads)) return [];
  const out: StoryStateThread[] = [];
  for (const t of threads) {
    if (typeof t === "string") {
      const description = t.trim();
      if (!description) continue;
      out.push({
        id: legacyThreadId(description),
        description,
        openedBatch: 0,
      });
      continue;
    }
    if (t && typeof t === "object") {
      const obj = t as Partial<StoryStateThread>;
      const id =
        typeof obj.id === "string" && obj.id.trim()
          ? obj.id.trim()
          : typeof obj.description === "string"
            ? legacyThreadId(obj.description)
            : "";
      const description =
        typeof obj.description === "string" ? obj.description.trim() : id;
      if (!id || !description) continue;
      out.push({
        id,
        description,
        openedBatch:
          typeof obj.openedBatch === "number" && Number.isFinite(obj.openedBatch)
            ? obj.openedBatch
            : 0,
      });
    }
  }
  return out;
}

export function normalizeStoryState(raw: unknown): StoryState {
  if (!raw || typeof raw !== "object") return emptyStoryState();
  const obj = raw as Partial<StoryState>;
  return {
    facts: Array.isArray(obj.facts)
      ? obj.facts.filter((f): f is string => typeof f === "string")
      : [],
    characters: Array.isArray(obj.characters)
      ? obj.characters
          .filter(
            (c): c is { name: string; status: string } =>
              !!c &&
              typeof c === "object" &&
              typeof (c as { name?: unknown }).name === "string" &&
              typeof (c as { status?: unknown }).status === "string"
          )
          .map((c) => ({ name: c.name, status: c.status }))
      : [],
    openThreads: normalizeOpenThreads(obj.openThreads),
  };
}

function legacyThreadId(description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug || "thread";
}

function normalizeOpened(item: unknown): ThreadOpened | null {
  if (typeof item === "string") {
    const description = item.trim();
    if (!description) return null;
    return { id: legacyThreadId(description), description };
  }
  if (item && typeof item === "object") {
    const obj = item as Partial<ThreadOpened>;
    const description =
      typeof obj.description === "string" ? obj.description.trim() : "";
    const id =
      typeof obj.id === "string" && obj.id.trim()
        ? obj.id.trim()
        : description
          ? legacyThreadId(description)
          : "";
    if (!id) return null;
    return { id, description: description || id };
  }
  return null;
}

function normalizeResolved(item: unknown): ThreadResolved | null {
  if (typeof item === "string") {
    const id = item.trim();
    if (!id) return null;
    // Legacy string resolution used fuzzy substring; treat as exact id OR exact description match only.
    return { id };
  }
  if (item && typeof item === "object") {
    const obj = item as Partial<ThreadResolved>;
    const id = typeof obj.id === "string" ? obj.id.trim() : "";
    if (!id) return null;
    return { id };
  }
  return null;
}

export function normalizeStateDelta(
  delta: unknown,
  openedBatch = 0
): StateDelta | null {
  if (!delta || typeof delta !== "object") return null;
  const obj = delta as Record<string, unknown>;
  const newFacts = Array.isArray(obj.newFacts)
    ? obj.newFacts.filter((f): f is string => typeof f === "string")
    : [];
  const characterUpdates = Array.isArray(obj.characterUpdates)
    ? obj.characterUpdates
        .filter(
          (c): c is { name: string; status: string } =>
            !!c &&
            typeof c === "object" &&
            typeof (c as { name?: unknown }).name === "string" &&
            typeof (c as { status?: unknown }).status === "string"
        )
        .map((c) => ({ name: c.name, status: c.status }))
    : [];
  const threadsOpened = (Array.isArray(obj.threadsOpened) ? obj.threadsOpened : [])
    .map(normalizeOpened)
    .filter((t): t is ThreadOpened => t != null)
    .map((t) => ({ ...t, openedBatch: openedBatch || undefined }));
  const threadsResolved = (Array.isArray(obj.threadsResolved)
    ? obj.threadsResolved
    : []
  )
    .map(normalizeResolved)
    .filter((t): t is ThreadResolved => t != null);

  return { newFacts, characterUpdates, threadsOpened, threadsResolved };
}

/**
 * Pure merge of one StateDelta onto StoryState.
 * Thread resolution is exact-ID only (plus exact description match for legacy string ids).
 */
export function mergeStoryStateDelta(
  current: StoryState | undefined | null,
  delta: StateDelta | undefined | null,
  openedBatch = 0
): StoryState {
  const base = normalizeStoryState(current ?? emptyStoryState());
  const normalized = delta
    ? normalizeStateDelta(delta, openedBatch) ?? {
        newFacts: [],
        characterUpdates: [],
        threadsOpened: [],
        threadsResolved: [],
      }
    : null;
  if (!normalized) return base;

  const facts = [...base.facts, ...(normalized.newFacts ?? [])].slice(
    -STORY_STATE_FACT_CAP
  );

  const characters = [...base.characters];
  for (const update of normalized.characterUpdates ?? []) {
    const idx = characters.findIndex(
      (c) => c.name.toLowerCase() === update.name.toLowerCase()
    );
    if (idx >= 0) characters[idx] = { name: characters[idx].name, status: update.status };
    else characters.push({ name: update.name, status: update.status });
  }

  let openThreads = [...base.openThreads];
  for (const opened of normalized.threadsOpened ?? []) {
    if (openThreads.some((t) => t.id === opened.id)) continue;
    openThreads.push({
      id: opened.id,
      description: opened.description,
      openedBatch: openedBatch || opened.openedBatch || 0,
    });
  }
  for (const resolved of normalized.threadsResolved ?? []) {
    const needle = resolved.id.trim().toLowerCase();
    if (!needle) continue;
    openThreads = openThreads.filter(
      (t) =>
        t.id.toLowerCase() !== needle && t.description.toLowerCase() !== needle
    );
  }
  if (openThreads.length > STORY_STATE_THREAD_CAP) {
    openThreads = openThreads.slice(-STORY_STATE_THREAD_CAP);
  }

  return { facts, characters, openThreads };
}

export interface BatchStateSource {
  batchNumber: number;
  stateDelta?: StateDelta | null;
}

/** Fold all stored deltas in absolute batch order. Pure / testable. */
export function rebuildStoryStateFromDeltas(
  batches: BatchStateSource[]
): StoryState {
  const ordered = batches
    .slice()
    .sort((a, b) => a.batchNumber - b.batchNumber);
  let state = emptyStoryState();
  for (const batch of ordered) {
    state = mergeStoryStateDelta(state, batch.stateDelta, batch.batchNumber);
  }
  return state;
}

/** Rebuild state as it existed immediately before batch N (batches with number < N). */
export function rebuildStoryStateBeforeBatch(
  batches: BatchStateSource[],
  beforeBatchNumber: number
): StoryState {
  return rebuildStoryStateFromDeltas(
    batches.filter((b) => b.batchNumber < beforeBatchNumber)
  );
}
