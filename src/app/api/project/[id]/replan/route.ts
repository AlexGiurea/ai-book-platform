import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  await store.updateStatus(id, "queued");
  await store.enqueueJob(id, "plan", { force: true });

  return NextResponse.json({ ok: true, projectId: id });
}
