import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import { makeId } from "@/lib/agent/context-store";
import { JobKeys } from "@/lib/agent/job-keys";
import { getCurrentUser } from "@/lib/auth/session";
import { rejectCrossOrigin } from "@/lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const project = await store.getProjectForUser(id, user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "awaiting_approval" && project.status !== "failed") {
    return NextResponse.json(
      { error: `Cannot replan from status "${project.status}"` },
      { status: 409 }
    );
  }
  if (project.batches.length > 0) {
    return NextResponse.json(
      {
        error:
          "Replan is only available before writing begins. This project already contains manuscript prose.",
      },
      { status: 409 }
    );
  }

  const planningRunId = `replan:${makeId()}`;
  await store.updateStatus(id, "queued");
  await store.enqueueJob(id, "plan", {
    force: true,
    dedupeKey: JobKeys.plan(planningRunId),
    payload: { planningRunId },
  });

  return NextResponse.json({ ok: true, projectId: id });
}
