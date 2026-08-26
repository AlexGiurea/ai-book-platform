/**
 * Ledger integration check against a real database.
 *
 *   npm run billing:check
 *
 * Separate from `npm test` because it needs DATABASE_URL and a real user and
 * project row to satisfy the foreign keys. It exists because the bug it caught
 * is not reachable by a unit test: `period_start` comes back from the driver as
 * a JS Date in LOCAL time, so formatting it in JS produced a string Postgres
 * rejected, and settlement failed silently for every book — meaning nobody
 * would ever have been credited back their unused words.
 *
 * Cleans up after itself. Safe to re-run.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";

async function loadLocalEnv(): Promise<void> {
  try {
    const env = await readFile(resolve(".env.local"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      process.env[trimmed.slice(0, index)] = trimmed
        .slice(index + 1)
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
    }
  } catch {
    /* optional */
  }
}

async function main(): Promise<void> {
  await loadLocalEnv();
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const { getSql } = await import("@/lib/db/postgres");
  const { reserveWords, settleWords, wordsUsedInPeriod, getUsage } = await import(
    "@/lib/billing/ledger"
  );
  const sql = getSql();

  // Any real user with any real project satisfies the foreign keys.
  const seed = (await sql`
    select p.id as project_id, p.user_id
    from projects p
    where p.user_id is not null
    order by p.created_at desc
    limit 1
  `) as { project_id: string; user_id: string }[];
  if (!seed.length) {
    console.error("No project with a user to test against.");
    process.exit(1);
  }
  const { project_id: PROJECT, user_id: USER } = seed[0];
  console.log(`Using project ${PROJECT} (user ${USER})\n`);

  const cleanup = async () =>
    sql`delete from word_ledger where project_id = ${PROJECT}`;

  const checks: [string, () => Promise<void>][] = [
    [
      "a reserve debits, and a replayed reserve does not double-charge",
      async () => {
        await cleanup();
        const before = await wordsUsedInPeriod(USER);
        const first = await reserveWords({
          userId: USER, projectId: PROJECT, plan: "author", words: 12_000,
        });
        assert.equal(first.ok, true);
        assert.equal(await wordsUsedInPeriod(USER), before + 12_000);
        const replay = await reserveWords({
          userId: USER, projectId: PROJECT, plan: "author", words: 12_000,
        });
        assert.equal(replay.ok, true, "a replay reads as success");
        assert.equal(await wordsUsedInPeriod(USER), before + 12_000);
      },
    ],
    [
      "a short book credits the difference back, exactly once",
      async () => {
        await cleanup();
        const before = await wordsUsedInPeriod(USER);
        await reserveWords({ userId: USER, projectId: PROJECT, plan: "author", words: 12_000 });
        const settled = await settleWords({ projectId: PROJECT, actualWords: 11_117 });
        assert.equal(settled.settled, true, "settlement must actually happen");
        assert.equal(settled.delta, -883);
        assert.equal(await wordsUsedInPeriod(USER), before + 11_117);
        const again = await settleWords({ projectId: PROJECT, actualWords: 11_117 });
        assert.equal(again.settled, false, "settlement runs once per project");
        assert.equal(await wordsUsedInPeriod(USER), before + 11_117);
      },
    ],
    [
      "a book that produced nothing costs nothing",
      async () => {
        await cleanup();
        const before = await wordsUsedInPeriod(USER);
        await reserveWords({ userId: USER, projectId: PROJECT, plan: "author", words: 40_000 });
        await settleWords({ projectId: PROJECT, actualWords: 0, note: "failed" });
        assert.equal(await wordsUsedInPeriod(USER), before);
      },
    ],
    [
      "a book that does not fit is refused and charges nothing",
      async () => {
        await cleanup();
        const before = await wordsUsedInPeriod(USER);
        const r = await reserveWords({
          userId: USER, projectId: PROJECT, plan: "free", words: 188_000,
        });
        assert.equal(r.ok, false);
        assert.equal(await wordsUsedInPeriod(USER), before);
      },
    ],
    [
      "an owner account is unmetered",
      async () => {
        const owner = await getUsage({ userId: USER, plan: "free", isOwner: true });
        assert.equal(owner.unlimited, true);
        assert.equal(owner.ok, true);
      },
    ],
  ];

  let failed = 0;
  for (const [name, run] of checks) {
    try {
      await run();
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failed++;
      console.error(`  FAIL  ${name}`);
      console.error(`        ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  await cleanup();

  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
