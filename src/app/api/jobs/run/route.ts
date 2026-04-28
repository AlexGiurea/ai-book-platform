import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processNextGenerationJob } from "@/lib/agent/job-runner";
import { getCurrentUser } from "@/lib/auth/session";
import { rateLimit, rejectCrossOrigin } from "@/lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 300;

function hasRunnerSecret(request: Request): boolean {
  const expected = process.env.JOB_RUNNER_SECRET ?? process.env.CRON_SECRET;
  if (!expected) return false;

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

async function runScopedJob(request: Request) {
  const limited = rateLimit(request, {
    key: "jobs:run",
    limit: 120,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getCurrentUser();
  const globalRunner = hasRunnerSecret(request);
  if (!user && !globalRunner) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processNextGenerationJob(globalRunner ? undefined : user?.id);
  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  return runScopedJob(request);
}

export async function GET(request: Request) {
  return runScopedJob(request);
}
