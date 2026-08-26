import { NextResponse } from "next/server";
import { store } from "@/lib/agent";
import type { ProjectInput } from "@/lib/agent";
import { JobKeys } from "@/lib/agent/job-keys";
import { getCurrentUser } from "@/lib/auth/session";
import { concurrentBooksFor, isOwnerEmail } from "@/lib/plans";
import { wordsForLength } from "@/lib/billing/allowance";
import { getUsage, reserveWords } from "@/lib/billing/ledger";
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

  // Folio meters words, so length is no longer gated by plan — the allowance
  // decides. Check before creating anything, so an unaffordable book fails
  // cleanly instead of leaving a stranded project behind.
  const length = input.preferences.length ?? "medium";
  const requestedWords = wordsForLength(length);
  const isOwner = isOwnerEmail(user.email);

  // Two different limits. The allowance caps a month's spend; this caps how
  // much of a shared worker one account can occupy right now, so a single user
  // cannot queue their whole allowance and sit in front of everyone else.
  const activeBooks = await store.countActiveProjectsForUser(user.id);
  const concurrencyLimit = concurrentBooksFor(user.plan);
  if (activeBooks >= concurrencyLimit) {
    return NextResponse.json(
      {
        error:
          concurrencyLimit === 1
            ? "You already have a book being written. Wait for it to finish, or cancel it, before starting another."
            : `You can write ${concurrencyLimit} books at once on your plan, and ${activeBooks} are already running.`,
        code: "concurrency_limit",
        limit: concurrencyLimit,
        active: activeBooks,
      },
      { status: 429 }
    );
  }

  const usage = await getUsage({
    userId: user.id,
    plan: user.plan,
    isOwner,
    requested: requestedWords,
  });
  if (!usage.ok) {
    return NextResponse.json(
      {
        error: `This book needs ${requestedWords.toLocaleString()} words and you have ${usage.remaining.toLocaleString()} left this month.`,
        code: "allowance_exceeded",
        usage: {
          allowance: usage.allowance,
          used: usage.used,
          remaining: usage.remaining,
          requested: requestedWords,
          shortfall: usage.shortfall,
          shortfallUsd: usage.shortfallUsd,
          period: usage.period,
        },
      },
      { status: 402 }
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

  // Debit now. The insert re-checks the balance at write time, so two creates
  // racing for the same headroom cannot both succeed.
  const reserved = await reserveWords({
    userId: user.id,
    projectId: project.id,
    plan: user.plan,
    isOwner,
    words: requestedWords,
  });
  if (!reserved.ok) {
    await store.updateStatus(
      project.id,
      "cancelled",
      "Not enough words left in this month's allowance."
    );
    return NextResponse.json(
      {
        error: `This book needs ${requestedWords.toLocaleString()} words and you have ${reserved.remaining.toLocaleString()} left this month.`,
        code: "allowance_exceeded",
      },
      { status: 402 }
    );
  }

  await store.enqueueJob(project.id, "plan", {
    force: true,
    dedupeKey: JobKeys.planInitial(),
    payload: { planningRunId: "initial" },
  });

  return NextResponse.json({
    projectId: project.id,
    words: { reserved: requestedWords, remaining: reserved.remaining },
  });
}
