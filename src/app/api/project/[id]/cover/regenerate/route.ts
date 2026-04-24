import { NextResponse } from "next/server";
import { coverAgent, store } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = store.getProject(id);
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

  coverAgent.generateCover(id).catch((err) => {
    console.error(`[folio] cover regeneration failed for ${id}:`, err);
  });

  return NextResponse.json({ ok: true, projectId: id });
}
