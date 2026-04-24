import { NextResponse } from "next/server";
import { bookComposer, store } from "@/lib/agent";

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
  if (project.status !== "awaiting_approval" && project.status !== "failed") {
    return NextResponse.json(
      { error: `Cannot replan from status "${project.status}"` },
      { status: 409 }
    );
  }

  bookComposer.replan(id).catch((err) => {
    console.error(`[folio] replan failed for ${id}:`, err);
  });

  return NextResponse.json({ ok: true, projectId: id });
}
