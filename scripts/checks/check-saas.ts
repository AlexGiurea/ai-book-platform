/**
 * Verification, durable rate limiting, and plan-change auditing, against a real
 * database.
 *
 *   npm run saas:check
 *
 * These three share a property that makes unit tests useless for them: the bug
 * you get wrong is always in the SQL or the driver's type mapping, not in the
 * branching. Creates a throwaway account, exercises everything, deletes it.
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
  // The account this creates must never be gated by a real provider.
  delete process.env.RESEND_API_KEY;
  process.env.FOLIO_REQUIRE_EMAIL_VERIFICATION = "false";

  const { getSql } = await import("@/lib/db/postgres");
  const {
    issueVerificationToken,
    verifyToken,
    isEmailVerified,
    sendsInLastHour,
  } = await import("@/lib/auth/verification");
  const { checkDurableRateLimit, pruneRateLimits } = await import(
    "@/lib/security/durable-rate-limit"
  );
  const { setUserPlan, planHistory } = await import("@/lib/billing/plan-changes");

  const sql = getSql();
  const suffix = Math.abs(
    [...String(process.pid)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)
  );
  const userId = `check-saas-${suffix}`;
  const email = `check-saas-${suffix}@folio.invalid`;

  const cleanup = async () => {
    await sql`delete from users where id = ${userId}`;
    await sql`delete from rate_limits where bucket like ${`check-saas-%`}`;
  };
  await cleanup();

  await sql`
    insert into users (id, email, email_normalized, name, plan, password_hash, password_salt)
    values (${userId}, ${email}, ${email}, 'Check', 'free', 'x', 'y')
  `;
  console.log(`Using throwaway account ${email}\n`);

  const checks: [string, () => Promise<void>][] = [
    [
      "a new account starts unverified",
      async () => {
        assert.equal(await isEmailVerified(userId), false);
      },
    ],
    [
      "a valid token verifies the account, and a replay still reads as success",
      async () => {
        const issued = await issueVerificationToken({
          userId,
          emailNormalized: email,
        });
        assert.ok(issued, "token should be issued");
        const first = await verifyToken(issued.token);
        assert.equal(first.ok, true);
        assert.equal(await isEmailVerified(userId), true);
        // Clicking the link twice is not an error from the reader's side.
        const second = await verifyToken(issued.token);
        assert.equal(second.ok, true);
        assert.equal(
          second.ok && second.alreadyVerified,
          true,
          "a consumed token reports already-verified"
        );
      },
    ],
    [
      "an unknown token is rejected",
      async () => {
        const result = await verifyToken("not-a-real-token");
        assert.equal(result.ok, false);
        assert.equal(result.ok === false && result.reason, "invalid");
      },
    ],
    [
      "an expired token is rejected",
      async () => {
        const issued = await issueVerificationToken({
          userId,
          emailNormalized: email,
        });
        assert.ok(issued);
        await sql`
          update email_verifications
          set expires_at = now() - interval '1 hour'
          where user_id = ${userId} and consumed_at is null
        `;
        const result = await verifyToken(issued.token);
        assert.equal(result.ok, false);
        assert.equal(result.ok === false && result.reason, "expired");
      },
    ],
    [
      "send attempts are counted for throttling",
      async () => {
        const n = await sendsInLastHour(email);
        assert.ok(n >= 2, `expected at least 2 issued tokens, saw ${n}`);
      },
    ],
    [
      "the durable rate limit counts across calls and then refuses",
      async () => {
        const key = "check-saas-limit";
        const options = { key, subject: userId, limit: 3, windowMs: 60_000 };
        const seen: boolean[] = [];
        for (let i = 0; i < 5; i++) {
          seen.push((await checkDurableRateLimit(options)).allowed);
        }
        assert.deepEqual(
          seen,
          [true, true, true, false, false],
          "three allowed, then refused"
        );
      },
    ],
    [
      "different subjects do not share a bucket",
      async () => {
        const options = { key: "check-saas-limit", limit: 1, windowMs: 60_000 };
        const a = await checkDurableRateLimit({ ...options, subject: "a" });
        const b = await checkDurableRateLimit({ ...options, subject: "b" });
        assert.equal(a.allowed, true);
        assert.equal(b.allowed, true, "b must not inherit a's count");
      },
    ],
    [
      "a plan change is applied and audited, and a repeat is not re-logged",
      async () => {
        const up = await setUserPlan({ userId, plan: "author", reason: "admin" });
        assert.equal(up.changed, true);
        assert.equal(up.from, "free");
        assert.equal(up.to, "author");

        const repeat = await setUserPlan({ userId, plan: "author", reason: "admin" });
        assert.equal(repeat.changed, false, "no-op change must not write an audit row");

        const down = await setUserPlan({ userId, plan: "free", reason: "stripe_cancelled" });
        assert.equal(down.changed, true);

        const history = await planHistory(userId);
        assert.equal(history.length, 2, `expected 2 audit rows, saw ${history.length}`);
        assert.equal(history[0].toPlan, "free", "newest first");
        assert.equal(history[1].toPlan, "author");
      },
    ],
    [
      "words already spent survive a plan change",
      async () => {
        // The documented rule: the allowance is read from the plan held now,
        // and usage is untouched. An upgrade must not wipe the ledger.
        const { reserveWords, wordsUsedInPeriod } = await import("@/lib/billing/ledger");
        const project = (await sql`
          select id from projects order by created_at desc limit 1
        `) as { id: string }[];
        if (!project[0]) return;

        await sql`delete from word_ledger where user_id = ${userId}`;
        await sql`
          insert into word_ledger (user_id, project_id, kind, words, period_start)
          values (${userId}, ${project[0].id}, 'grant', 12000, date_trunc('month', now())::date)
        `;
        const before = await wordsUsedInPeriod(userId);
        assert.equal(before, 12_000);

        await setUserPlan({ userId, plan: "author", reason: "admin" });
        assert.equal(
          await wordsUsedInPeriod(userId), 12_000,
          "an upgrade must not reset usage"
        );

        // 12k spent against a 40k allowance leaves room for a 24k book.
        const fits = await reserveWords({
          userId, projectId: project[0].id, plan: "author", words: 24_000,
        });
        assert.equal(fits.ok, true, "the raised ceiling applies immediately");
        await sql`delete from word_ledger where user_id = ${userId}`;
      },
    ],
    [
      "pruning drops only windows nobody can be inside",
      async () => {
        await sql`
          insert into rate_limits (bucket, window_start, count)
          values ('check-saas-old', now() - interval '48 hours', 1)
          on conflict do nothing
        `;
        const removed = await pruneRateLimits(24);
        assert.ok(removed >= 1, "the stale window should have been pruned");
        // The stored bucket is "<key>:<subject>", not the key alone.
        const fresh = (await sql`
          select count(*)::int as n from rate_limits
          where bucket like 'check-saas-limit:%'
            and window_start > now() - interval '1 hour'
        `) as { n: number }[];
        assert.ok(fresh[0].n >= 1, "a live window must survive pruning");
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
  const leftover = (await sql`
    select count(*)::int as n from users where id = ${userId}
  `) as { n: number }[];
  assert.equal(leftover[0].n, 0, "the throwaway account was not cleaned up");

  console.log(`\n${checks.length - failed}/${checks.length} passed`);
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
