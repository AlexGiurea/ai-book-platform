import { NextResponse } from "next/server";
import { store } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await store.getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (project.status !== "awaiting_approval" && project.status !== "failed") {
    return NextResponse.json(
      { error: `Cannot replan from status "${project.status}"` },
      { status: 409 }
    );
  }

  await store.updateStatus(id, "queued");
  await store.enqueueJob(id, "plan", { force: true });

  return NextResponse.json({ ok: true, projectId: id });
}
