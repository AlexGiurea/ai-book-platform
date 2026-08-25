import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  drainGenerationJobs,
  processNextGenerationJob,
} from "@/lib/agent/job-runner";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit, rejectCrossOrigin } from "@/lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 300;

function hasRunnerSecret(request: Request): boolean {
  const expected = process.env.JOB_RUNNER_SECRET ?? process.env.CRON_SECRET;
  if (!expected) {
    // Silence here is how the daily cron went unnoticed for months: with no
    // secret configured, every scheduled GET fell through to the signed-in
    // path and answered 401, so no book ever advanced without a browser.
    console.error(
      "[jobs/run] NO SCHEDULER SECRET CONFIGURED — set JOB_RUNNER_SECRET (or " +
        "CRON_SECRET) in the deployment environment. Until then the cron " +
        "cannot drain the queue and generation only advances while a browser " +
        "is open on the page."
    );
    return false;
  }

  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-job-runner-secret") ?? "";
  const provided = auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : headerSecret;

  if (!provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return (
    expectedBytes.length === providedBytes.length &&
    timingSafeEqual(expectedBytes, providedBytes)
  );
}

/**
 * One job, scoped to the caller. This is what the browser calls while a book is
 * on screen: it returns as soon as a single job is done so the page can render
 * progress rather than hanging on an open request.
 */
async function runOneScopedJob(request: Request) {
  const limited = rateLimit(request, {
    key: "jobs:run",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processNextGenerationJob(user.id);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  return runOneScopedJob(request);
}

/**
 * The scheduler entry point. Vercel cron issues a GET carrying CRON_SECRET as a
 * bearer token; that caller drains the whole queue for every user instead of
 * advancing one job, which is what makes a book finish with no browser open.
 *
 * A signed-in GET keeps the old single-job behaviour so nothing in the UI
 * depends on which verb it used.
 */
export async function GET(request: Request) {
  if (hasRunnerSecret(request)) {
    const result = await drainGenerationJobs();
    console.info("[jobs/run] drain", result);
    return NextResponse.json({ ok: true, ...result });
  }
  return runOneScopedJob(request);
}
