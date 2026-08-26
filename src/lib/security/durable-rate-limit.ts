/**
 * Rate limiting that survives serverless.
 *
 * The in-memory limiter counts per instance, so the real ceiling is
 * limit x instances, and instances come and go. That is acceptable for a poll —
 * paying a database write to throttle a status check would be worse than the
 * leak — but not for anything that creates accounts, sends mail, or spends
 * money on model calls. Those count here.
 *
 * Fixed window rather than sliding: one indexed upsert per request, no read
 * before write, and the worst case is a caller getting up to 2x the limit
 * across a window boundary. A sliding window costs a range scan per request to
 * buy back an edge nobody is exploiting.
 */

import { NextResponse } from "next/server";
import { getSql, hasDatabaseUrl } from "@/lib/db/postgres";

export interface DurableRateLimitOptions {
  /** What is being limited, e.g. "auth:signup". */
  key: string;
  /** Who is being limited — a user id, or an IP for anonymous callers. */
  subject: string;
  limit: number;
  windowMs: number;
  /** Shown to the caller when they are over. */
  message?: string;
}

export interface DurableRateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

function windowStart(windowMs: number, now: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export async function checkDurableRateLimit(
  options: DurableRateLimitOptions
): Promise<DurableRateLimitResult> {
  const now = Date.now();
  const start = windowStart(options.windowMs, now);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((start.getTime() + options.windowMs - now) / 1000)
  );

  // No database means no durable counter. Fail OPEN: the in-memory limiter is
  // still in front of these routes, and refusing every request because the
  // database is unreachable turns a rate limiter into an outage.
  if (!hasDatabaseUrl()) {
    return { allowed: true, count: 0, limit: options.limit, retryAfterSeconds };
  }

  const bucket = `${options.key}:${options.subject}`;
  try {
    const rows = (await getSql()`
      insert into rate_limits (bucket, window_start, count)
      values (${bucket}, ${start.toISOString()}, 1)
      on conflict (bucket, window_start)
      do update set count = rate_limits.count + 1
      returning count
    `) as { count: number }[];
    const count = rows[0]?.count ?? 1;
    return {
      allowed: count <= options.limit,
      count,
      limit: options.limit,
      retryAfterSeconds,
    };
  } catch (err) {
    console.error(
      "[rate-limit] durable check failed, allowing request:",
      err instanceof Error ? err.message : String(err)
    );
    return { allowed: true, count: 0, limit: options.limit, retryAfterSeconds };
  }
}

/** Returns a 429 response when the caller is over, or null to continue. */
export async function durableRateLimit(
  options: DurableRateLimitOptions
): Promise<NextResponse | null> {
  const result = await checkDurableRateLimit(options);
  if (result.allowed) return null;
  return NextResponse.json(
    {
      error: options.message ?? "Too many requests. Try again shortly.",
      code: "rate_limited",
      retryAfter: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    }
  );
}

/**
 * Drop counters for windows nobody can still be inside. Called opportunistically
 * rather than on a schedule — the table is tiny and this keeps it that way
 * without another cron.
 */
export async function pruneRateLimits(olderThanHours = 24): Promise<number> {
  if (!hasDatabaseUrl()) return 0;
  const rows = (await getSql()`
    delete from rate_limits
    where window_start < now() - make_interval(hours => ${olderThanHours})
    returning bucket
  `) as unknown[];
  return rows.length;
}
