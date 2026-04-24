import { NextResponse } from "next/server";
import { bookComposer, store } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 800;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = store.getProject(id);
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

  bookComposer.writeBook(id).catch((err) => {
    console.error(`[folio] writeBook failed for ${id}:`, err);
  });

  return NextResponse.json({ ok: true, projectId: id });
}
