/**
 * A/B one book per write granularity, same idea, same preset, same models.
 *
 *   npm run quality:ab -- --arm batch
 *   npm run quality:ab -- --arm chapter
 *   npm run quality:ab -- --arm chapter --resume mt6n4x6i-y4v2r7py
 *
 * Run the two arms as two separate processes: granularity is read from
 * process.env at job time, so one process can only ever be one arm. Job claiming
 * is scoped to this arm's projectId, so the two runs share the queue without
 * stealing each other's work.
 *
 * What this measures: cost is the clean signal — call counts follow the
 * blueprint deterministically, so the spend difference is real at n=1. Quality
 * is the noisy one; the batch arm doubles as a replicate of the existing 83/100
 * run, which is what turns "chapter scored X" into a claim with some notion of
 * run-to-run variance behind it.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const AB_IDEA = [
  "A side story set in the Final Empire during the year of the Luthadel rebellion,",
  "told in close third person from the point of view of Vessa Ollun, a skaa woman",
  "who runs a loading crew on the Luthadel canal docks. She is nobody's chosen one",
  "and never meets the crew whose work is changing the city. She experiences the",
  "rebellion the way most skaa do: as rumour, as disrupted grain shipments, as",
  "obligators asking new questions, and as ash falling in patterns the old dockhands",
  "say are wrong. Her concern is the eleven people on her crew and the ration tallies",
  "that keep them alive through winter. When a canal barge arrives carrying cargo",
  "that appears on no manifest, she has to decide how much she is willing to know,",
  "and what she owes the people who depend on her. Use entirely original characters",
  "and an original plot set against the established backdrop. Do not retell events",
  "from the main narrative, do not feature its protagonists, and do not reproduce",
  "any existing published text.",
].join(" ");

/** Cover art is orthogonal to granularity — skip it and save the call. */
const AB_PREFERENCES = {
  genre: "Fantasy",
  tone: "Dark",
  length: "medium" as const,
  imageStyle: "none",
  pov: "third",
};

const AB_USER_ID = "moexozgv-jdklq57w";
const AB_PLAN = "pro" as const;

/** No job claimable and the project is not finished: back off, then re-poll. */
const STALL_SLEEP_MS = 15_000;
const MAX_CONSECUTIVE_STALLS = 40; // ~10 minutes of nothing before giving up.

async function loadLocalEnv(): Promise<void> {
  try {
    const env = await readFile(resolve(".env.local"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed
        .slice(index + 1)
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
      process.env[key] = value;
    }
  } catch {
    // Optional outside local development.
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv: string[]) {
  let arm: "batch" | "chapter" | undefined;
  let resumeId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--arm") {
      const raw = argv[++i];
      if (raw !== "batch" && raw !== "chapter") {
        throw new Error(`--arm must be "batch" or "chapter", got "${raw}"`);
      }
      arm = raw;
    } else if (argv[i] === "--resume") {
      resumeId = argv[++i];
    }
  }
  if (!arm) throw new Error("--arm batch|chapter is required");
  return { arm, resumeId };
}

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

async function main(): Promise<void> {
  await loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required. Add it to .env.local.");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required. Add it to .env.local.");
    process.exit(1);
  }

  const { arm, resumeId } = parseArgs(process.argv.slice(2));

  // Set before any pipeline module is imported. readWriteGranularity() reads
  // process.env per call, but setting it first removes the question entirely.
  process.env.FOLIO_WRITE_GRANULARITY = arm;

  const { neon } = await import("@neondatabase/serverless");
  const { store } = await import("@/lib/agent/context-store");
  const { processNextGenerationJob } = await import("@/lib/agent/job-runner");
  const { JobKeys } = await import("@/lib/agent/job-keys");
  const { costForUsage, formatUsd } = await import("@/lib/quality/pricing");

  const sql = neon(process.env.DATABASE_URL);

  let projectId: string;
  if (resumeId) {
    const existing = await store.getProject(resumeId);
    if (!existing) throw new Error(`Cannot resume: project ${resumeId} not found`);
    projectId = resumeId;
    console.log(
      `[${stamp()}] arm=${arm} resuming ${projectId} (status=${existing.status})`
    );

    // A run that died on something transient leaves failed rows holding the
    // dedupe keys, and a project stamped "failed" that the drain loop would
    // exit on immediately. Clear both before entering the loop.
    const requeued = await store.requeueFailedJobs(projectId);
    if (requeued) console.log(`[${stamp()}] arm=${arm} requeued ${requeued} stuck job(s)`);
    if (existing.status === "failed" || existing.status === "cancelled") {
      const next = existing.bible ? "writing" : "queued";
      await store.updateStatus(projectId, next);
      console.log(`[${stamp()}] arm=${arm} status ${existing.status} -> ${next}`);
    }
  } else {
    const project = await store.createProject(
      {
        idea: AB_IDEA,
        preferences: AB_PREFERENCES,
        inputMode: "text",
        contextFileNames: [],
      },
      AB_USER_ID,
      AB_PLAN
    );
    projectId = project.id;
    await store.enqueueJob(projectId, "plan", {
      force: true,
      dedupeKey: JobKeys.planInitial(),
      payload: { planningRunId: "initial" },
    });

    await mkdir(resolve("ab-runs"), { recursive: true });
    await writeFile(
      resolve("ab-runs", `${projectId}.json`),
      JSON.stringify(
        {
          projectId,
          arm,
          startedAt: new Date().toISOString(),
          preferences: AB_PREFERENCES,
          note: "write-granularity A/B; idea and preset match project mt6n4x6i-y4v2r7py",
        },
        null,
        2
      ),
      "utf8"
    );
    console.log(`[${stamp()}] arm=${arm} created ${projectId}`);
  }

  const startedAt = Date.now();
  let stalls = 0;
  let lastReport = 0;

  for (;;) {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} vanished mid-run`);

    if (project.status === "complete") {
      console.log(
        `[${stamp()}] arm=${arm} COMPLETE — ${project.totalWords.toLocaleString()} words`
      );
      break;
    }
    if (project.status === "failed" || project.status === "cancelled") {
      console.error(
        `[${stamp()}] arm=${arm} ${project.status.toUpperCase()}: ${project.error ?? "(no message)"}`
      );
      break;
    }

    // The UI gate. Unattended, the harness is the human.
    if (project.status === "awaiting_approval") {
      if (!project.bible) throw new Error("awaiting_approval with no bible");
      const chapters = new Set(project.bible.batches.map((b) => b.chapterNumber));
      console.log(
        `[${stamp()}] arm=${arm} auto-approving plan — ${project.bible.batches.length} batches across ${chapters.size} chapters`
      );
      await store.updateStatus(projectId, "writing");
      await store.enqueueJob(projectId, "write", {
        force: true,
        dedupeKey: JobKeys.write(1),
        payload: { batchNumber: 1 },
      });
      continue;
    }

    const result = await processNextGenerationJob(undefined, projectId);
    if (!result.processed) {
      stalls++;
      if (stalls >= MAX_CONSECUTIVE_STALLS) {
        console.error(
          `[${stamp()}] arm=${arm} STALLED — no claimable job for ${((STALL_SLEEP_MS * stalls) / 60_000).toFixed(0)}m at status=${project.status}`
        );
        break;
      }
      await sleep(STALL_SLEEP_MS);
      continue;
    }
    stalls = 0;

    const mark = result.status === "failed" ? `FAILED (${result.error})` : "ok";
    console.log(`[${stamp()}] arm=${arm} ${result.type} ${mark}`);

    // Cost tally every couple of minutes, so spend is watchable, not a surprise.
    if (Date.now() - lastReport > 120_000) {
      lastReport = Date.now();
      const rows = (await sql`
        select model,
               sum(input_tokens)::int        as input_tokens,
               sum(cached_input_tokens)::int as cached_input_tokens,
               sum(cache_write_tokens)::int  as cache_write_tokens,
               sum(output_tokens)::int       as output_tokens,
               count(*)::int                 as calls
        from llm_usage where project_id = ${projectId} group by model
      `) as {
        model: string;
        input_tokens: number;
        cached_input_tokens: number;
        cache_write_tokens: number;
        output_tokens: number;
        calls: number;
      }[];
      const spend = rows.reduce(
        (acc, r) =>
          acc +
          costForUsage(r.model, {
            inputTokens: r.input_tokens,
            cachedInputTokens: r.cached_input_tokens,
            cacheWriteTokens: r.cache_write_tokens,
            outputTokens: r.output_tokens,
          }).totalCost,
        0
      );
      const calls = rows.reduce((acc, r) => acc + r.calls, 0);
      const fresh = await store.getProject(projectId);
      console.log(
        `[${stamp()}] arm=${arm} … ${fresh?.totalWords.toLocaleString() ?? 0} words · ${calls} calls · ${formatUsd(spend)} · ${((Date.now() - startedAt) / 60_000).toFixed(0)}m elapsed`
      );
    }
  }

  console.log(
    `[${stamp()}] arm=${arm} project=${projectId} finished in ${((Date.now() - startedAt) / 60_000).toFixed(0)}m`
  );
  console.log(`  score it:  npm run quality:score -- --project ${projectId} --judge`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
