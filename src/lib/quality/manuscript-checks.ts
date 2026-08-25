/**
 * Deterministic manuscript checks — no model calls, no cost.
 *
 * These cover the defect classes a critic reading excerpts structurally cannot
 * see: a thread planted in act one and never paid off, a planned character who
 * never reaches the page, a book that quietly runs 35% over its target. They
 * are the objective half of the quality score; the LLM judge is the subjective
 * half.
 */

import type { Batch, StoryBible, StoryState } from "@/lib/agent/types";

export type CheckStatus = "pass" | "warn" | "fail" | "skipped";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  /** Headline number for trend tracking across runs. Omitted when not numeric. */
  value?: number;
  /** Human-readable one-liner. */
  detail: string;
  /** Offending specifics, capped for readability. */
  items?: string[];
}

export interface CheckInput {
  targetWords: number;
  totalWords: number;
  bible?: StoryBible;
  storyState?: StoryState;
  batches: Batch[];
}

const MAX_ITEMS = 12;

function cap(items: string[]): string[] {
  if (items.length <= MAX_ITEMS) return items;
  return [...items.slice(0, MAX_ITEMS), `…and ${items.length - MAX_ITEMS} more`];
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ─── 1. Total length adherence ────────────────────────────────

export function checkTotalLength(input: CheckInput): CheckResult {
  const { targetWords, totalWords } = input;
  if (!targetWords) {
    return {
      id: "total-length",
      label: "Total length vs target",
      status: "skipped",
      detail: "Project has no target word count.",
    };
  }
  const ratio = totalWords / targetWords;
  const drift = ratio - 1;
  const status: CheckStatus =
    Math.abs(drift) > 0.25 ? "fail" : Math.abs(drift) > 0.12 ? "warn" : "pass";
  return {
    id: "total-length",
    label: "Total length vs target",
    status,
    value: ratio,
    detail: `${totalWords.toLocaleString()} words against a ${targetWords.toLocaleString()} target (${drift >= 0 ? "+" : ""}${pct(drift)}).`,
  };
}

// ─── 2. Per-batch length adherence ────────────────────────────

export function checkBatchLength(input: CheckInput): CheckResult {
  const blueprints = new Map(
    (input.bible?.batches ?? []).map((b) => [b.number, b.targetWords])
  );
  const ratios: number[] = [];
  const overruns: string[] = [];

  for (const batch of input.batches) {
    const target = blueprints.get(batch.batchNumber);
    if (!target) continue;
    const ratio = batch.wordCount / target;
    ratios.push(ratio);
    if (ratio > 1.2) {
      overruns.push(
        `§${batch.batchNumber}: ${batch.wordCount.toLocaleString()}w vs ${target.toLocaleString()}w target (+${pct(ratio - 1)})`
      );
    }
  }

  if (!ratios.length) {
    return {
      id: "batch-length",
      label: "Per-batch length discipline",
      status: "skipped",
      detail: "No blueprint targets available to compare against.",
    };
  }

  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const overrunShare = overruns.length / ratios.length;
  const status: CheckStatus =
    mean > 1.25 || overrunShare > 0.5 ? "fail" : mean > 1.1 ? "warn" : "pass";

  return {
    id: "batch-length",
    label: "Per-batch length discipline",
    status,
    value: mean,
    detail: `Batches average ${pct(mean - 1)} ${mean >= 1 ? "over" : "under"} their blueprint target; ${overruns.length} of ${ratios.length} exceed it by more than 20%.`,
    items: overruns.length ? cap(overruns) : undefined,
  };
}

// ─── 3. Thread resolution ─────────────────────────────────────

export function checkThreadResolution(input: CheckInput): CheckResult {
  const ledger = input.bible?.threadLedger ?? [];
  if (!ledger.length) {
    return {
      id: "thread-resolution",
      label: "Planted threads resolved",
      status: "skipped",
      detail:
        "Bible carries no thread ledger — this book predates the v3 planner, so thread payoff cannot be verified mechanically.",
    };
  }

  const stillOpen = new Set(
    (input.storyState?.openThreads ?? []).map((t) => t.id)
  );
  const everOpened = new Set<string>();
  for (const batch of input.batches) {
    for (const opened of batch.stateDelta?.threadsOpened ?? []) {
      everOpened.add(opened.id);
    }
  }

  const unresolved: string[] = [];
  const neverPlanted: string[] = [];

  for (const entry of ledger) {
    if (!everOpened.has(entry.id)) {
      neverPlanted.push(
        `[${entry.id}] ${entry.description} — planned for batch ${entry.plantBatch}, never opened`
      );
      continue;
    }
    if (stillOpen.has(entry.id)) {
      unresolved.push(
        `[${entry.id}] ${entry.description} — due by batch ${entry.resolveByBatch}, still open`
      );
    }
  }

  const broken = unresolved.length + neverPlanted.length;
  const status: CheckStatus =
    unresolved.length > 0 ? "fail" : neverPlanted.length > 0 ? "warn" : "pass";

  return {
    id: "thread-resolution",
    label: "Planted threads resolved",
    status,
    value: ledger.length ? 1 - broken / ledger.length : undefined,
    detail: `${ledger.length - broken} of ${ledger.length} planned threads planted and resolved; ${unresolved.length} left open, ${neverPlanted.length} never planted.`,
    items: broken ? cap([...unresolved, ...neverPlanted]) : undefined,
  };
}

// ─── 4. Planned characters who never reach the page ───────────

export function checkCharacterPresence(input: CheckInput): CheckResult {
  const characters = input.bible?.characters ?? [];
  if (!characters.length) {
    return {
      id: "character-presence",
      label: "Planned characters appear in the text",
      status: "skipped",
      detail: "Bible carries no character list.",
    };
  }

  const manuscript = input.batches.map((b) => b.prose).join("\n").toLowerCase();
  const missing: string[] = [];

  for (const character of characters) {
    // Match on the first name token — bibles often carry full names that the
    // prose never uses in full ("Captain Elena Marsh" written as "Elena").
    const firstToken = character.name.trim().split(/\s+/)[0]?.toLowerCase();
    if (!firstToken || firstToken.length < 3) continue;
    if (!manuscript.includes(firstToken)) {
      missing.push(`${character.name} (${character.role})`);
    }
  }

  const status: CheckStatus = missing.length ? "fail" : "pass";
  return {
    id: "character-presence",
    label: "Planned characters appear in the text",
    status,
    value: (characters.length - missing.length) / characters.length,
    detail: `${characters.length - missing.length} of ${characters.length} planned characters appear in the manuscript.`,
    items: missing.length ? cap(missing) : undefined,
  };
}

// ─── 5. Em-dash ban compliance ────────────────────────────────

export function checkEmDashBan(input: CheckInput): CheckResult {
  let count = 0;
  const offenders: string[] = [];
  for (const batch of input.batches) {
    const matches = batch.prose.match(/—/g);
    if (matches?.length) {
      count += matches.length;
      offenders.push(`§${batch.batchNumber}: ${matches.length}`);
    }
  }
  return {
    id: "em-dash-ban",
    label: "Em-dash ban held",
    status: count === 0 ? "pass" : "fail",
    value: count,
    detail:
      count === 0
        ? "No em-dashes survived into the manuscript."
        : `${count} em-dashes reached the final prose despite the ban and the sanitizer.`,
    items: offenders.length ? cap(offenders) : undefined,
  };
}

// ─── 6. Repeated distinctive phrases ──────────────────────────

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "as", "by", "from", "that", "this", "it", "is", "was", "were", "be",
  "been", "had", "has", "have", "he", "she", "they", "his", "her", "their",
  "him", "them", "i", "you", "we", "not", "no", "so", "if", "then", "there",
  "into", "out", "up", "down", "over", "back", "what", "when", "who", "would",
  "could", "said", "like", "one", "all", "her", "its", "him",
]);

const SHINGLE_SIZE = 7;
const MIN_OCCURRENCES = 3;

export function checkRepeatedPhrases(input: CheckInput): CheckResult {
  const words = input.batches
    .map((b) => b.prose)
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  if (words.length < SHINGLE_SIZE * 4) {
    return {
      id: "repeated-phrases",
      label: "Distinctive phrases not reused",
      status: "skipped",
      detail: "Manuscript too short to sample phrase reuse.",
    };
  }

  const counts = new Map<string, number>();
  for (let i = 0; i + SHINGLE_SIZE <= words.length; i++) {
    const window = words.slice(i, i + SHINGLE_SIZE);
    const substantive = window.filter((w) => !STOPWORDS.has(w) && w.length > 3);
    // Require real lexical content, or every "and then he looked at the" collides.
    if (substantive.length < 4) continue;
    const key = window.join(" ");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const repeatedKeys = new Set(
    [...counts.entries()].filter(([, n]) => n >= MIN_OCCURRENCES).map(([k]) => k)
  );

  const passages = collapseRepeatedShingles(words, counts, repeatedKeys);

  const status: CheckStatus =
    passages.length > 8 ? "fail" : passages.length > 0 ? "warn" : "pass";

  return {
    id: "repeated-phrases",
    label: "Distinctive phrases not reused",
    status,
    value: passages.length,
    detail:
      passages.length === 0
        ? `No ${SHINGLE_SIZE}-word phrase recurs ${MIN_OCCURRENCES} or more times.`
        : `${passages.length} distinct ${passages.length === 1 ? "passage recurs" : "passages recur"} ${MIN_OCCURRENCES}+ times verbatim — a self-plagiarism signal that tracks voice drift.`,
    items: passages.length
      ? cap(
          passages.map(
            (p) => `${p.occurrences}x (${p.words} words) "${truncate(p.text)}"`
          )
        )
      : undefined,
  };
}

interface RepeatedPassage {
  text: string;
  words: number;
  occurrences: number;
}

function truncate(text: string, limit = 90): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * Turn repeated shingles into the passages they actually came from.
 *
 * Counting each ${SHINGLE_SIZE}-word window on its own massively overstates the
 * problem: a single repeated 22-word passage contains 16 overlapping windows and
 * was reported as 16 separate findings, which is how a deliberate motif — the
 * same crew roster read out three times, once hidden, once official, once
 * public — turned into a FAIL on a book the judge scored 88.
 *
 * Two steps fix it. Consecutive repeated windows are walked into one maximal
 * passage, and passages sharing any window are grouped, because the same text
 * repeated in three places yields three runs whose edges differ with their
 * surroundings and so never match exactly.
 */
function collapseRepeatedShingles(
  words: string[],
  counts: Map<string, number>,
  repeatedKeys: Set<string>
): RepeatedPassage[] {
  const lastStart = words.length - SHINGLE_SIZE;
  const runs: { text: string; words: number; occurrences: number; keys: string[] }[] = [];

  for (let i = 0; i <= lastStart; ) {
    const key = words.slice(i, i + SHINGLE_SIZE).join(" ");
    if (!repeatedKeys.has(key)) {
      i++;
      continue;
    }
    const keys = [key];
    let end = i;
    let occurrences = counts.get(key) ?? MIN_OCCURRENCES;
    while (end < lastStart) {
      const nextKey = words.slice(end + 1, end + 1 + SHINGLE_SIZE).join(" ");
      if (!repeatedKeys.has(nextKey)) break;
      keys.push(nextKey);
      occurrences = Math.min(occurrences, counts.get(nextKey) ?? occurrences);
      end++;
    }
    runs.push({
      text: words.slice(i, end + SHINGLE_SIZE).join(" "),
      words: end + SHINGLE_SIZE - i,
      occurrences,
      keys,
    });
    i = end + 1;
  }

  // Group runs that share a window: those are the same passage seen again.
  const groupOfKey = new Map<string, number>();
  const groups: RepeatedPassage[] = [];
  for (const run of runs) {
    let group = -1;
    for (const key of run.keys) {
      const existing = groupOfKey.get(key);
      if (existing !== undefined) {
        group = existing;
        break;
      }
    }
    if (group === -1) {
      group = groups.length;
      groups.push({ text: run.text, words: run.words, occurrences: run.occurrences });
    } else if (run.words > groups[group].words) {
      groups[group].text = run.text;
      groups[group].words = run.words;
    }
    groups[group].occurrences = Math.max(groups[group].occurrences, run.occurrences);
    for (const key of run.keys) groupOfKey.set(key, group);
  }

  return groups.sort(
    (a, b) => b.occurrences - a.occurrences || b.words - a.words
  );
}

// ─── 7. Chapter length balance ────────────────────────────────

export function checkChapterBalance(input: CheckInput): CheckResult {
  const byChapter = new Map<number, number>();
  for (const batch of input.batches) {
    if (batch.chapterNumber == null) continue;
    byChapter.set(
      batch.chapterNumber,
      (byChapter.get(batch.chapterNumber) ?? 0) + batch.wordCount
    );
  }

  const lengths = [...byChapter.values()];
  if (lengths.length < 3) {
    return {
      id: "chapter-balance",
      label: "Chapter length balance",
      status: "skipped",
      detail: "Fewer than three chapters carry a word count.",
    };
  }

  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance =
    lengths.reduce((acc, n) => acc + (n - mean) ** 2, 0) / lengths.length;
  const cv = Math.sqrt(variance) / mean;

  const status: CheckStatus = cv > 0.45 ? "fail" : cv > 0.28 ? "warn" : "pass";
  const shortest = Math.min(...lengths);
  const longest = Math.max(...lengths);

  return {
    id: "chapter-balance",
    label: "Chapter length balance",
    status,
    value: cv,
    detail: `Chapter lengths vary by ${pct(cv)} (shortest ${shortest.toLocaleString()}w, longest ${longest.toLocaleString()}w across ${lengths.length} chapters).`,
  };
}

// ─── Runner ───────────────────────────────────────────────────

export const ALL_CHECKS = [
  checkTotalLength,
  checkBatchLength,
  checkThreadResolution,
  checkCharacterPresence,
  checkEmDashBan,
  checkRepeatedPhrases,
  checkChapterBalance,
] as const;

export interface CheckSummary {
  results: CheckResult[];
  passed: number;
  warned: number;
  failed: number;
  skipped: number;
}

export function runManuscriptChecks(input: CheckInput): CheckSummary {
  const results = ALL_CHECKS.map((check) => check(input));
  return {
    results,
    passed: results.filter((r) => r.status === "pass").length,
    warned: results.filter((r) => r.status === "warn").length,
    failed: results.filter((r) => r.status === "fail").length,
    skipped: results.filter((r) => r.status === "skipped").length,
  };
}
