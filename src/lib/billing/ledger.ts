/**
 * The word ledger — where an allowance is actually spent.
 *
 * Append-only. A book debits its target words up front so an unaffordable book
 * is refused before any planning spend, then posts a correction once the real
 * word count is known. Cancelled and failed books give the reserve back.
 *
 * Every write is idempotent against replay, because the job queue replays: a
 * partial unique index allows one reserve and one settlement per project, and
 * these functions swallow the conflict rather than double-charging.
 */

import { getSql, hasDatabaseUrl } from "@/lib/db/postgres";
import {
  checkAffordability,
  monthlyWordsFor,
  periodStart,
  type Affordability,
} from "./allowance";

export type LedgerKind = "reserve" | "settle" | "refund" | "grant";

export interface LedgerEntry {
  id: string;
  projectId: string | null;
  kind: LedgerKind;
  words: number;
  periodStart: string;
  note: string | null;
  createdAt: string;
}

/** Words consumed by a user in one allowance period. Never negative. */
export async function wordsUsedInPeriod(
  userId: string,
  period: string = periodStart()
): Promise<number> {
  if (!hasDatabaseUrl()) return 0;
  const rows = (await getSql()`
    select coalesce(sum(words), 0)::int as used
    from word_ledger
    where user_id = ${userId} and period_start = ${period}
  `) as { used: number }[];
  return Math.max(0, rows[0]?.used ?? 0);
}

export interface UsageSnapshot extends Affordability {
  period: string;
  plan: string;
}

/**
 * What the create page and the usage endpoint both render. `requested` is the
 * book being considered — pass 0 to ask only "where do I stand?".
 */
export async function getUsage(input: {
  userId: string;
  plan: unknown;
  isOwner?: boolean;
  requested?: number;
  now?: Date;
}): Promise<UsageSnapshot> {
  const period = periodStart(input.now);
  const used = await wordsUsedInPeriod(input.userId, period);
  const allowance = monthlyWordsFor(input.plan, input.isOwner ?? false);
  return {
    ...checkAffordability({ allowance, used, requested: input.requested ?? 0 }),
    period,
    plan: String(input.plan ?? "free"),
  };
}

/**
 * Debit a book's target words. Returns the affordability decision; the caller
 * must not create the project when `ok` is false.
 *
 * The check and the insert are one statement so two concurrent creates cannot
 * both see the same headroom and both spend it — the insert's WHERE clause
 * re-evaluates the balance at write time.
 */
export async function reserveWords(input: {
  userId: string;
  projectId: string;
  plan: unknown;
  isOwner?: boolean;
  words: number;
  now?: Date;
}): Promise<Affordability & { period: string }> {
  const period = periodStart(input.now);
  const allowance = monthlyWordsFor(input.plan, input.isOwner ?? false);

  if (!hasDatabaseUrl()) {
    return {
      ...checkAffordability({ allowance, used: 0, requested: input.words }),
      period,
    };
  }

  const sql = getSql();
  // Infinity cannot cross the wire; owners get a ceiling nothing will reach.
  const limit = Number.isFinite(allowance) ? allowance : 2_000_000_000;

  const inserted = (await sql`
    insert into word_ledger (user_id, project_id, kind, words, period_start, note)
    select ${input.userId}, ${input.projectId}, 'reserve', ${input.words}, ${period},
           ${`target for ${input.words} words`}
    where (
      select coalesce(sum(words), 0)
      from word_ledger
      where user_id = ${input.userId} and period_start = ${period}
    ) + ${input.words} <= ${limit}
    on conflict do nothing
    returning id
  `) as { id: string }[];

  const used = await wordsUsedInPeriod(input.userId, period);

  if (!inserted.length) {
    // Either it did not fit, or this project already holds a reserve. The
    // second case is a replay and must read as success.
    const existing = (await sql`
      select 1 from word_ledger
      where project_id = ${input.projectId} and kind = 'reserve' limit 1
    `) as unknown[];
    if (existing.length) {
      return {
        ...checkAffordability({ allowance, used, requested: 0 }),
        period,
      };
    }
    return {
      ...checkAffordability({
        allowance,
        used,
        requested: input.words,
      }),
      ok: false,
      period,
    };
  }

  return {
    ...checkAffordability({ allowance, used, requested: 0 }),
    period,
  };
}

/**
 * Correct a reserve to what was actually delivered.
 *
 * `actualWords` of 0 means the book produced nothing — a failure or a cancel
 * before any prose — so the whole reserve comes back. Runs once per project;
 * a replayed completion is a no-op.
 */
export async function settleWords(input: {
  projectId: string;
  actualWords: number;
  note?: string;
}): Promise<{ settled: boolean; delta: number }> {
  if (!hasDatabaseUrl()) return { settled: false, delta: 0 };
  const sql = getSql();

  // to_char, not the raw date column. The driver hydrates `date` into a JS Date
  // in LOCAL time, so String(...).slice(0,10) yields "Sat Aug 01" — which
  // Postgres then rejects, and settlement silently fails for everyone. Even
  // .toISOString() would be wrong: a UTC-midnight date parsed as local time
  // lands on the previous day east of UTC. Formatting in the database is the
  // only version with no timezone in it.
  const rows = (await sql`
    select user_id, words, to_char(period_start, 'YYYY-MM-DD') as period_start
    from word_ledger
    where project_id = ${input.projectId} and kind = 'reserve'
    limit 1
  `) as { user_id: string; words: number; period_start: string }[];

  const reserve = rows[0];
  if (!reserve) return { settled: false, delta: 0 };

  const period = reserve.period_start;
  const delta = Math.round(input.actualWords) - reserve.words;

  const inserted = (await sql`
    insert into word_ledger (user_id, project_id, kind, words, period_start, note)
    values (
      ${reserve.user_id}, ${input.projectId}, 'settle', ${delta}, ${period},
      ${input.note ?? `delivered ${Math.round(input.actualWords)} words against ${reserve.words} reserved`}
    )
    on conflict do nothing
    returning id
  `) as { id: string }[];

  return { settled: inserted.length > 0, delta };
}

/** Recent ledger activity, newest first — for the usage panel. */
export async function recentEntries(
  userId: string,
  limit = 20
): Promise<LedgerEntry[]> {
  if (!hasDatabaseUrl()) return [];
  const rows = (await getSql()`
    select id, project_id, kind, words,
           to_char(period_start, 'YYYY-MM-DD') as period_start,
           note, created_at
    from word_ledger
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `) as {
    id: string | number;
    project_id: string | null;
    kind: string;
    words: number;
    period_start: string;
    note: string | null;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: String(r.id),
    projectId: r.project_id,
    kind: r.kind as LedgerKind,
    words: r.words,
    periodStart: r.period_start,
    note: r.note,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
