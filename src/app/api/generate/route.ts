import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import type { ProjectInput } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body as Partial<ProjectInput>;
  const canvas = input.canvas;
  const canvasHasContent =
    !!canvas &&
    ((canvas.characters?.length ?? 0) > 0 ||
      (canvas.world?.length ?? 0) > 0 ||
      (canvas.notes?.length ?? 0) > 0);
  const hasIdea =
    typeof input.idea === "string" && input.idea.trim().length > 0;
  const hasFiles =
    Array.isArray(input.contextFileNames) && input.contextFileNames.length > 0;

  if (!hasIdea && !canvasHasContent && !hasFiles) {
    return NextResponse.json(
      { error: "Provide an idea, canvas content, or an uploaded document." },
      { status: 400 }
    );
  }
  if (!input.preferences) {
    return NextResponse.json(
      { error: "Missing required field: preferences" },
      { status: 400 }
    );
  }

  const project = await store.createProject({
    idea: typeof input.idea === "string" ? input.idea : "",
    preferences: {
      genre: input.preferences.genre ?? "",
      tone: input.preferences.tone ?? "",
      length: input.preferences.length ?? "medium",
      imageStyle: input.preferences.imageStyle ?? "",
      pov: input.preferences.pov ?? "",
    },
    inputMode: input.inputMode ?? "text",
    contextFileNames: input.contextFileNames,
    contextFileContents: input.contextFileContents,
    canvas: canvas && {
      characters: canvas.characters ?? [],
      world: canvas.world ?? [],
      notes: canvas.notes ?? [],
    },
  });

  await store.enqueueJob(project.id, "plan");

  return NextResponse.json({ projectId: project.id });
}
