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
  if (!project.bible) {
    return NextResponse.json({ error: "Project has no blueprint" }, { status: 409 });
  }
  if (project.coverStatus === "generating") {
    return NextResponse.json(
      { error: "Cover generation is already running" },
      { status: 409 }
    );
  }

  await store.enqueueJob(id, "cover", { force: true });

  return NextResponse.json({ ok: true, projectId: id });
}
