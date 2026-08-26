/**
 * The money layer. Every assertion here is either a measured anchor or a case
 * that would silently overcharge or undercharge someone.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LENGTH_TARGET_WORDS,
  OVERAGE_USD_PER_1K_WORDS,
  PLAN_MONTHLY_WORDS,
  PURCHASABLE_PLANS,
  UNLIMITED_WORDS,
  checkAffordability,
  concurrentBooksFor,
  isPaidPlan,
  estimatedCogsUsd,
  formatWords,
  monthlyWordsFor,
  normalizePlan,
  periodEnd,
  periodStart,
  wordsForLength,
} from "./allowance";

describe("plan normalisation", () => {
  it("maps the legacy pro plan onto the tier that replaced it", () => {
    // Every account predating metering carries plan='pro'. Dropping them to
    // free would silently downgrade paying users.
    assert.equal(normalizePlan("pro"), "author");
  });

  it("accepts the current plans and falls back to free on anything else", () => {
    assert.equal(normalizePlan("free"), "free");
    assert.equal(normalizePlan("author"), "author");
    assert.equal(normalizePlan("novelist"), "novelist");
    for (const bad of [undefined, null, "", "enterprise", 7, {}]) {
      assert.equal(normalizePlan(bad), "free", String(bad));
    }
  });
});

describe("allowances", () => {
  it("gives every plan a positive monthly allowance", () => {
    for (const [plan, words] of Object.entries(PLAN_MONTHLY_WORDS)) {
      assert.ok(words > 0, `${plan} has no allowance`);
    }
  });

  it("keeps the developer plan unmetered and unsellable", () => {
    // Privilege lives in users.plan, not in an env var that a fresh machine or
    // a preview deployment might not have.
    assert.equal(PLAN_MONTHLY_WORDS.dev, UNLIMITED_WORDS);
    assert.equal(normalizePlan("dev"), "dev");
    assert.equal(monthlyWordsFor("dev"), UNLIMITED_WORDS);
    assert.equal(isPaidPlan("dev"), true);
    assert.ok(
      !PURCHASABLE_PLANS.includes("dev"),
      "dev must never appear on the pricing page"
    );
    const r = checkAffordability({
      allowance: monthlyWordsFor("dev"),
      used: 10_000_000,
      requested: LENGTH_TARGET_WORDS.tome,
    });
    assert.equal(r.ok, true);
    assert.equal(r.unlimited, true);
  });

  it("lets bigger plans run more books at once", () => {
    assert.ok(concurrentBooksFor("free") >= 1, "everyone can write one book");
    assert.ok(concurrentBooksFor("author") > concurrentBooksFor("free"));
    assert.ok(concurrentBooksFor("novelist") > concurrentBooksFor("author"));
    assert.ok(concurrentBooksFor("dev") > concurrentBooksFor("novelist"));
  });

  it("free covers exactly one dev book, so the tier is a real sample", () => {
    assert.equal(PLAN_MONTHLY_WORDS.free, LENGTH_TARGET_WORDS.dev);
  });

  it("orders the tiers so upgrading always buys more", () => {
    assert.ok(PLAN_MONTHLY_WORDS.free < PLAN_MONTHLY_WORDS.author);
    assert.ok(PLAN_MONTHLY_WORDS.author < PLAN_MONTHLY_WORDS.novelist);
  });

  it("treats owners as unmetered", () => {
    assert.equal(monthlyWordsFor("free", true), UNLIMITED_WORDS);
    assert.equal(monthlyWordsFor("author", false), PLAN_MONTHLY_WORDS.author);
    assert.equal(monthlyWordsFor("pro"), PLAN_MONTHLY_WORDS.author);
  });

  it("prices an unknown length as medium rather than as free", () => {
    assert.equal(wordsForLength("tome"), 188_000);
    assert.equal(wordsForLength("nonsense"), LENGTH_TARGET_WORDS.medium);
    assert.equal(wordsForLength(undefined), LENGTH_TARGET_WORDS.medium);
  });
});

describe("affordability", () => {
  it("allows a request that fits", () => {
    const r = checkAffordability({ allowance: 40_000, used: 0, requested: 40_000 });
    assert.equal(r.ok, true);
    assert.equal(r.remaining, 40_000);
    assert.equal(r.shortfall, 0);
    assert.equal(r.shortfallUsd, 0);
  });

  it("blocks a request one word over, and quotes the shortfall", () => {
    const r = checkAffordability({ allowance: 40_000, used: 20_000, requested: 24_000 });
    assert.equal(r.ok, false);
    assert.equal(r.remaining, 20_000);
    assert.equal(r.shortfall, 4_000);
    assert.equal(r.shortfallUsd, 4 * OVERAGE_USD_PER_1K_WORDS);
  });

  it("never reports negative remaining when usage overshot the allowance", () => {
    // Books land within a few percent of target, but settlement can push a
    // period slightly over. That must read as zero left, not as a credit.
    const r = checkAffordability({ allowance: 12_000, used: 13_500, requested: 1 });
    assert.equal(r.remaining, 0);
    assert.equal(r.ok, false);
    assert.equal(r.shortfall, 1);
  });

  it("ignores a negative used value rather than turning it into headroom", () => {
    const r = checkAffordability({ allowance: 12_000, used: -5_000, requested: 12_000 });
    assert.equal(r.used, 0);
    assert.equal(r.remaining, 12_000);
    assert.equal(r.ok, true);
  });

  it("lets an owner past any request", () => {
    const r = checkAffordability({
      allowance: UNLIMITED_WORDS,
      used: 5_000_000,
      requested: 188_000,
    });
    assert.equal(r.ok, true);
    assert.equal(r.unlimited, true);
    assert.equal(r.shortfall, 0);
  });
});

describe("allowance period", () => {
  it("anchors to the first of the month in UTC", () => {
    assert.equal(periodStart(new Date("2026-08-26T23:30:00Z")), "2026-08-01");
    assert.equal(periodEnd(new Date("2026-08-26T23:30:00Z")), "2026-09-01");
  });

  it("rolls December into the next year", () => {
    assert.equal(periodStart(new Date("2026-12-31T23:59:59Z")), "2026-12-01");
    assert.equal(periodEnd(new Date("2026-12-31T23:59:59Z")), "2027-01-01");
  });

  it("puts the very start of a month in that month, not the previous one", () => {
    assert.equal(periodStart(new Date("2026-03-01T00:00:00Z")), "2026-03-01");
  });
});

describe("cost model", () => {
  // Both anchors are real books with real llm_usage rows behind them.
  it("reproduces the measured 11,117-word book at $1.21", () => {
    const est = estimatedCogsUsd(11_117);
    assert.ok(Math.abs(est - 1.21) / 1.21 < 0.03, `got ${est.toFixed(2)}`);
  });

  it("reproduces the measured 36,635-word book at $4.26 on Sol", () => {
    const est = estimatedCogsUsd(36_635);
    assert.ok(Math.abs(est - 4.26) / 4.26 < 0.03, `got ${est.toFixed(2)}`);
  });

  it("stays profitable against every plan's allowance", () => {
    // The whole point of the repricing. If any tier's allowance costs more to
    // serve than the tier charges, the business loses money per sale.
    const monthlyPrice: Record<string, number> = { free: 0, author: 19, novelist: 49 };
    for (const plan of PURCHASABLE_PLANS) {
      const words = PLAN_MONTHLY_WORDS[plan];
      const cogs = estimatedCogsUsd(words);
      if (plan === "free") {
        assert.ok(cogs < 1.5, `free tier costs ${cogs.toFixed(2)} to serve`);
        continue;
      }
      const margin = (monthlyPrice[plan] - cogs) / monthlyPrice[plan];
      assert.ok(margin > 0.5, `${plan} margin is only ${(margin * 100).toFixed(0)}%`);
    }
  });

  it("keeps overage above cost at the worst point on the menu", () => {
    const tome = LENGTH_TARGET_WORDS.tome;
    const cogsPer1k = (estimatedCogsUsd(tome) / tome) * 1000;
    assert.ok(
      OVERAGE_USD_PER_1K_WORDS > cogsPer1k * 1.5,
      `overage ${OVERAGE_USD_PER_1K_WORDS} vs cost ${cogsPer1k.toFixed(3)}/1k`
    );
  });

  it("costs nothing for nothing, and does not return NaN for an unmetered plan", () => {
    assert.equal(estimatedCogsUsd(0), 0);
    assert.equal(estimatedCogsUsd(-100), 0);
    assert.equal(estimatedCogsUsd(UNLIMITED_WORDS), 0);
  });
});

describe("formatting", () => {
  it("renders allowances the way the pricing page needs them", () => {
    assert.equal(formatWords(40_000), "40k");
    assert.equal(formatWords(188_000), "188k");
    assert.equal(formatWords(750), "750");
    assert.equal(formatWords(UNLIMITED_WORDS), "Unlimited");
  });
});
