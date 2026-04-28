import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import type { ProjectInput } from "@/lib/agent";
import { getCurrentUser } from "@/lib/auth/session";
import { canCreateProject, canUseLength } from "@/lib/plans";
import {
  rateLimit,
  readJsonLimited,
  rejectCrossOrigin,
} from "@/lib/security/request";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const limited = rateLimit(request, {
    key: "generate:create",
    limit: 12,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to create a book." }, { status: 401 });
  }

  const parsed = await readJsonLimited(request, 512 * 1024);
  if ("response" in parsed) return parsed.response;

  const input = parsed.data as Partial<ProjectInput>;
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

  const existingProjects = await store.listProjectsForUser(user.id);
  if (!canCreateProject(user.plan, existingProjects.length)) {
    return NextResponse.json(
      { error: "Free accounts can keep one generated book. Upgrade to Pro for more projects." },
      { status: 403 }
    );
  }

  if (!canUseLength(user.plan, input.preferences.length ?? "medium")) {
    return NextResponse.json(
      { error: "Novel, Epic, and Tome lengths are available on Pro." },
      { status: 403 }
    );
  }

  const project = await store.createProject(
    {
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
    },
    user.id,
    user.plan
  );

  await store.enqueueJob(project.id, "plan");

  return NextResponse.json({ projectId: project.id });
}
