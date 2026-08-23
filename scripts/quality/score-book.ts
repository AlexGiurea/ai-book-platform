/**
 * Score a finished manuscript and write a versioned benchmark row.
 *
 *   npm run quality:score -- --latest
 *   npm run quality:score -- --project moodeuif-6708si4c --judge
 *   npm run quality:score -- --all
 *
 * The deterministic checks are free. `--judge` adds one whole-book model call
 * (roughly $0.45 on Sol for a 55k-word manuscript) and is the only part that
 * costs money. Results land in quality-runs/ and are meant to be committed —
 * the point is a trend line you can re-run against a newer model in six months.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

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

interface Args {
  projectIds: string[];
  latest: boolean;
  all: boolean;
  judge: boolean;
  judgeModel: string;
  outDir: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    projectIds: [],
    latest: false,
    all: false,
    judge: false,
    judgeModel: process.env.QUALITY_JUDGE_MODEL?.trim() || "gpt-5.6-sol",
    outDir: "quality-runs",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project") args.projectIds.push(argv[++i]);
    else if (arg === "--latest") args.latest = true;
    else if (arg === "--all") args.all = true;
    else if (arg === "--judge") args.judge = true;
    else if (arg === "--judge-model") args.judgeModel = argv[++i];
    else if (arg === "--out") args.outDir = argv[++i];
  }
  return args;
}

const STATUS_MARK: Record<string, string> = {
  pass: "PASS",
  warn: "WARN",
  fail: "FAIL",
  skipped: "SKIP",
};

async function main(): Promise<void> {
  await loadLocalEnv();

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required. Add it to .env.local.");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  // Imported after env load — these modules read connection config on init.
  const { neon } = await import("@neondatabase/serverless");
  const { store } = await import("@/lib/agent/context-store");
  const { runManuscriptChecks } = await import("@/lib/quality/manuscript-checks");
  const { costForUsage, cacheHitRate, formatUsd, PRICING_VERIFIED_ON } =
    await import("@/lib/quality/pricing");

  const sql = neon(process.env.DATABASE_URL);

  let targets = args.projectIds;
  if (args.all || args.latest || !targets.length) {
    const rows = (await sql`
      select id from projects
      where status = 'complete'
      order by created_at desc
      ${args.all ? sql`` : sql`limit 1`}
    `) as { id: string }[];
    targets = rows.map((r) => r.id);
  }

  if (!targets.length) {
    console.error("No completed projects found to score.");
    process.exit(1);
  }

  await mkdir(resolve(args.outDir), { recursive: true });

  for (const projectId of targets) {
    const project = await store.getProject(projectId);
    if (!project) {
      console.error(`\nProject ${projectId} not found — skipping.`);
      continue;
    }

    // Read the raw column, not project.pipelineVersion — the store normalizes a
    // missing value to the current PIPELINE_VERSION on read, which would label
    // every pre-v3 book as v3 and silently corrupt run-over-run comparisons.
    const rawRows = (await sql`
      select pipeline_version, model_config, created_at
      from projects where id = ${projectId}
    `) as { pipeline_version: string | null; model_config: unknown; created_at: string }[];
    const rawPipelineVersion = rawRows[0]?.pipeline_version ?? null;
    const rawModelConfig = rawRows[0]?.model_config ?? null;

    console.log(`\n${"=".repeat(72)}`);
    console.log(`${project.title ?? "(untitled)"}  ·  ${projectId}`);
    console.log(
      `${project.totalWords.toLocaleString()} words · ${project.batches.length} batches · plan=${project.plan} · pipeline=${rawPipelineVersion ?? "pre-v3 (unstamped)"}`
    );
    console.log("=".repeat(72));

    // ─── Deterministic checks (free) ───
    const checks = runManuscriptChecks({
      targetWords: project.targetWords,
      totalWords: project.totalWords,
      bible: project.bible,
      storyState: project.storyState,
      batches: project.batches,
    });

    console.log("\nDETERMINISTIC CHECKS");
    for (const result of checks.results) {
      console.log(`  [${STATUS_MARK[result.status]}] ${result.label}`);
      console.log(`         ${result.detail}`);
      for (const item of result.items ?? []) {
        console.log(`           · ${item}`);
      }
    }
    console.log(
      `\n  ${checks.passed} passed · ${checks.warned} warned · ${checks.failed} failed · ${checks.skipped} skipped`
    );

    // ─── Cost rollup from llm_usage ───
    const usageRows = (await sql`
      select role, model,
             sum(input_tokens)::int         as input_tokens,
             sum(cached_input_tokens)::int  as cached_input_tokens,
             sum(cache_write_tokens)::int   as cache_write_tokens,
             sum(output_tokens)::int        as output_tokens,
             count(*)::int                  as calls
      from llm_usage
      where project_id = ${projectId}
      group by role, model
      order by sum(output_tokens) desc
    `) as {
      role: string;
      model: string;
      input_tokens: number;
      cached_input_tokens: number;
      cache_write_tokens: number;
      output_tokens: number;
      calls: number;
    }[];

    const costRows = usageRows.map((row) => {
      const tokens = {
        inputTokens: row.input_tokens,
        cachedInputTokens: row.cached_input_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        outputTokens: row.output_tokens,
      };
      return {
        role: row.role,
        model: row.model,
        calls: row.calls,
        tokens,
        cacheHitRate: cacheHitRate(tokens),
        cost: costForUsage(row.model, tokens),
      };
    });

    const measuredCost = costRows.reduce((acc, r) => acc + r.cost.totalCost, 0);

    console.log("\nMEASURED COST");
    if (!costRows.length) {
      console.log(
        "  No llm_usage rows — this book was generated before token accounting shipped."
      );
      console.log("  Cost for this run is unknown, not zero.");
    } else {
      for (const row of costRows) {
        const hit =
          row.cacheHitRate == null ? "n/a" : `${(row.cacheHitRate * 100).toFixed(0)}%`;
        console.log(
          `  ${row.role.padEnd(18)} ${row.model.padEnd(16)} ${String(row.calls).padStart(3)} calls  ` +
            `out=${String(row.tokens.outputTokens).padStart(8)}  cache=${hit.padStart(4)}  ${formatUsd(row.cost.totalCost)}`
        );
        if (!row.cost.priced) {
          console.log(`         (no price on file for ${row.model} — excluded from total)`);
        }
      }
      console.log(`  ${"".padEnd(18)} ${"TOTAL".padEnd(16)}${" ".repeat(28)}${formatUsd(measuredCost)}`);
      const perThousand = project.totalWords
        ? (measuredCost / project.totalWords) * 1000
        : 0;
      console.log(`  ${formatUsd(perThousand)} per 1,000 words · list prices as of ${PRICING_VERIFIED_ON}`);
    }

    // ─── Judge (costs money) ───
    let judgeResult = null;
    if (args.judge) {
      const { judgeManuscript } = await import("@/lib/quality/judge");
      console.log(`\nJUDGE  (${args.judgeModel}) — reading the full manuscript…`);
      judgeResult = await judgeManuscript({
        bible: project.bible,
        batches: project.batches,
        totalWords: project.totalWords,
        model: args.judgeModel,
      });

      const j = judgeResult.judgement;
      const judgeCost = costForUsage(args.judgeModel, judgeResult.usage);
      console.log(
        `  prose ${j.prose.score} · continuity ${j.continuity.score} · structure ${j.structure.score} · voice ${j.voice.score} · payoff ${j.payoff.score}`
      );
      console.log(`  OVERALL ${j.overall}/100`);
      console.log(`\n  ${j.verdict}`);
      for (const dim of ["prose", "continuity", "structure", "voice", "payoff"] as const) {
        console.log(`\n  ${dim} (${j[dim].score}): ${j[dim].note}`);
      }
      if (j.issues.length) {
        console.log("\n  ISSUES");
        for (const issue of j.issues) {
          const where = issue.chapter === 0 ? "book-wide" : `ch.${issue.chapter}`;
          console.log(`    [${issue.severity}] ${where}: ${issue.description}`);
        }
      }
      console.log(
        `\n  Judge cost ${formatUsd(judgeCost.totalCost)} · ${judgeResult.usage.inputTokens.toLocaleString()} in / ${judgeResult.usage.outputTokens.toLocaleString()} out · ${(judgeResult.durationMs / 1000).toFixed(0)}s`
      );
    }

    // ─── Persist the row ───
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const record = {
      schemaVersion: 1,
      recordedAt: new Date().toISOString(),
      project: {
        id: project.id,
        title: project.title,
        plan: project.plan,
        /** Raw column. Null means the book predates pipeline stamping. */
        pipelineVersion: rawPipelineVersion,
        lengthPreset: project.input.preferences.length,
        targetWords: project.targetWords,
        totalWords: project.totalWords,
        batches: project.batches.length,
        modelConfig: rawModelConfig,
      },
      checks,
      cost: {
        priceListVerifiedOn: PRICING_VERIFIED_ON,
        measured: costRows.length > 0,
        totalUsd: costRows.length ? measuredCost : null,
        usdPerThousandWords:
          costRows.length && project.totalWords
            ? (measuredCost / project.totalWords) * 1000
            : null,
        byRole: costRows,
      },
      judge: judgeResult,
    };

    const outPath = resolve(args.outDir, `${projectId}-${stamp}.json`);
    await writeFile(outPath, JSON.stringify(record, null, 2), "utf8");
    console.log(`\n  Written to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
