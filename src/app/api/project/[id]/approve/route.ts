import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
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
  if (project.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: `Cannot approve from status "${project.status}"` },
      { status: 409 }
    );
  }
  if (!project.bible) {
    return NextResponse.json({ error: "Project has no blueprint to approve" }, { status: 409 });
  }

  await store.updateStatus(id, "writing");
  await store.enqueueJob(id, "write");
  if (project.input.preferences.imageStyle !== "none") {
    await store.enqueueJob(id, "cover");
  }

  return NextResponse.json({ ok: true, projectId: id });
}
