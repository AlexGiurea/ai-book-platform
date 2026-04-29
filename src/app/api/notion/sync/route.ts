import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import { syncBookToNotion } from "@/lib/notion/book-sync";
import { rejectCrossOrigin } from "@/lib/security/request";

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

async function runSync(request: Request) {
  if (!hasRunnerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const projects = await store.listProjects();
  let synced = 0;
  const errors: { projectId: string; error: string }[] = [];

  for (const project of projects) {
    try {
      await syncBookToNotion(project);
      synced += 1;
    } catch (err) {
      errors.push({
        projectId: project.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({ ok: errors.length === 0, synced, errors });
}

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;
  return runSync(request);
}

export async function GET(request: Request) {
  return runSync(request);
}
