/**
 * Quality harness — deterministic check and pricing invariants.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkBatchLength,
  checkCharacterPresence,
  checkChapterBalance,
  checkEmDashBan,
  checkRepeatedPhrases,
  checkThreadResolution,
  checkTotalLength,
  runManuscriptChecks,
  type CheckInput,
} from "./manuscript-checks";
import { MODEL_PRICES, cacheHitRate, costForUsage, formatUsd } from "./pricing";
import type { Batch, StoryBible } from "@/lib/agent/types";

function batch(n: number, words: number, prose: string, chapter = 1): Batch {
  return {
    batchNumber: n,
    chapterNumber: chapter,
    chapterTitle: `Chapter ${chapter}`,
    prose,
    wordCount: words,
    createdAt: new Date(0).toISOString(),
  };
}

function bible(overrides: Partial<StoryBible> = {}): StoryBible {
  return {
    title: "T",
    synopsis: "s",
    premise: "p",
    logline: "l",
    setting: { world: "w", era: "e", rules: "r", atmosphere: "a" },
    characters: [],
    themes: [],
    structure: {
      actBreakdown: "a",
      inciting: "i",
      midpoint: "m",
      climax: "c",
      resolution: "r",
    },
    voiceGuide: "v",
    styleGuide: "s",
    chapters: [],
    batches: [],
    totalBatches: 0,
    targetWords: 0,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function input(overrides: Partial<CheckInput> = {}): CheckInput {
  return { targetWords: 1000, totalWords: 1000, batches: [], ...overrides };
}

describe("total length adherence", () => {
  it("passes when close to target and fails on the 35% overrun we see in production", () => {
    assert.equal(checkTotalLength(input({ totalWords: 1050 })).status, "pass");
    assert.equal(checkTotalLength(input({ totalWords: 1200 })).status, "warn");

    const real = checkTotalLength(input({ targetWords: 40_000, totalWords: 54_691 }));
    assert.equal(real.status, "fail");
    assert.ok(real.value && real.value > 1.36 && real.value < 1.37);
  });

  it("skips rather than dividing by zero when no target is set", () => {
    assert.equal(checkTotalLength(input({ targetWords: 0 })).status, "skipped");
  });
});

describe("per-batch length discipline", () => {
  it("flags batches that blow past their blueprint target", () => {
    const result = checkBatchLength(
      input({
        bible: bible({
          batches: [
            { number: 1, chapterNumber: 1, chapterTitle: "c", positionInChapter: "opening", purpose: "p", scenes: [], charactersPresent: [], settingLocation: "s", toneNote: "t", continuityFlags: [], targetWords: 2800 },
            { number: 2, chapterNumber: 1, chapterTitle: "c", positionInChapter: "closing", purpose: "p", scenes: [], charactersPresent: [], settingLocation: "s", toneNote: "t", continuityFlags: [], targetWords: 2800 },
          ],
        }),
        batches: [batch(1, 3900, "x"), batch(2, 3800, "x")],
      })
    );
    assert.equal(result.status, "fail");
    assert.equal(result.items?.length, 2);
  });

  it("skips when there are no blueprint targets to compare against", () => {
    assert.equal(checkBatchLength(input({ batches: [batch(1, 3000, "x")] })).status, "skipped");
  });
});

describe("thread resolution", () => {
  const ledger = [
    { id: "t1", description: "the debt", plantBatch: 2, resolveByBatch: 8 },
    { id: "t2", description: "the letter", plantBatch: 3, resolveByBatch: 9 },
  ];

  it("passes when every planted thread closed", () => {
    const result = checkThreadResolution(
      input({
        bible: bible({ threadLedger: ledger }),
        storyState: { facts: [], characters: [], openThreads: [] },
        batches: [
          {
            ...batch(1, 10, "x"),
            stateDelta: {
              newFacts: [],
              characterUpdates: [],
              threadsOpened: [{ id: "t1", description: "d" }, { id: "t2", description: "d" }],
              threadsResolved: [],
            },
          },
        ],
      })
    );
    assert.equal(result.status, "pass");
  });

  it("fails on a thread still open at the end and warns on one never planted", () => {
    const stillOpen = checkThreadResolution(
      input({
        bible: bible({ threadLedger: ledger }),
        storyState: {
          facts: [],
          characters: [],
          openThreads: [{ id: "t1", description: "the debt", openedBatch: 2 }],
        },
        batches: [
          {
            ...batch(1, 10, "x"),
            stateDelta: {
              newFacts: [],
              characterUpdates: [],
              threadsOpened: [{ id: "t1", description: "d" }, { id: "t2", description: "d" }],
              threadsResolved: [],
            },
          },
        ],
      })
    );
    assert.equal(stillOpen.status, "fail");
    assert.match(stillOpen.items?.[0] ?? "", /t1/);

    const neverPlanted = checkThreadResolution(
      input({
        bible: bible({ threadLedger: ledger }),
        storyState: { facts: [], characters: [], openThreads: [] },
        batches: [
          {
            ...batch(1, 10, "x"),
            stateDelta: {
              newFacts: [],
              characterUpdates: [],
              threadsOpened: [{ id: "t1", description: "d" }],
              threadsResolved: [],
            },
          },
        ],
      })
    );
    assert.equal(neverPlanted.status, "warn");
    assert.match(neverPlanted.items?.[0] ?? "", /never opened/);
  });

  it("skips for pre-v3 books rather than reporting a false pass", () => {
    const result = checkThreadResolution(input({ bible: bible() }));
    assert.equal(result.status, "skipped");
  });
});

describe("character presence", () => {
  it("catches a planned character who never reaches the page", () => {
    const result = checkCharacterPresence(
      input({
        bible: bible({
          characters: [
            { name: "Elena Marsh", role: "protagonist", description: "", voice: "", motivation: "", arc: "", relationships: "" },
            { name: "Tovald Rhun", role: "antagonist", description: "", voice: "", motivation: "", arc: "", relationships: "" },
          ],
        }),
        batches: [batch(1, 10, "Elena walked to the gate and waited.")],
      })
    );
    assert.equal(result.status, "fail");
    assert.equal(result.items?.length, 1);
    assert.match(result.items?.[0] ?? "", /Tovald/);
  });

  it("matches on the first name, since prose rarely repeats full names", () => {
    const result = checkCharacterPresence(
      input({
        bible: bible({
          characters: [
            { name: "Captain Elena Marsh", role: "protagonist", description: "", voice: "", motivation: "", arc: "", relationships: "" },
          ],
        }),
        // "Captain" is the first token here, and it does appear.
        batches: [batch(1, 10, "The captain said nothing.")],
      })
    );
    assert.equal(result.status, "pass");
  });
});

describe("em-dash ban", () => {
  it("passes on clean prose and fails when the sanitizer let one through", () => {
    assert.equal(checkEmDashBan(input({ batches: [batch(1, 5, "No dashes here.")] })).status, "pass");
    const failed = checkEmDashBan(input({ batches: [batch(1, 5, "She paused—then left.")] }));
    assert.equal(failed.status, "fail");
    assert.equal(failed.value, 1);
  });
});

describe("repeated phrases", () => {
  it("ignores stopword-heavy filler but catches a reused distinctive phrase", () => {
    const distinctive = "moonlight fractured across the obsidian harbour stones";
    // Filler must be non-repeating, or its own shingles register as reuse.
    const filler = (seed: number) =>
      Array.from({ length: 60 }, (_, i) => `lexeme${seed * 1000 + i}`).join(" ");
    const prose = [filler(1), distinctive, filler(2), distinctive, filler(3), distinctive, filler(4)].join(" ");

    const result = checkRepeatedPhrases(input({ batches: [batch(1, 400, prose)] }));
    assert.equal(result.status, "warn");
    assert.equal(result.value, 1);
    assert.match(result.items?.join(" ") ?? "", /obsidian harbour/);
  });

  it("does not flag ordinary stopword-heavy sentence rhythm", () => {
    const line = "and then he looked at the door and it was there again so he";
    const prose = Array.from({ length: 30 }, () => line).join(" ");
    assert.equal(checkRepeatedPhrases(input({ batches: [batch(1, 400, prose)] })).status, "pass");
  });

  it("skips a manuscript too short to sample", () => {
    assert.equal(checkRepeatedPhrases(input({ batches: [batch(1, 3, "too short")] })).status, "skipped");
  });
});

describe("chapter balance", () => {
  it("flags wildly uneven chapters and passes even ones", () => {
    const even = checkChapterBalance(
      input({ batches: [batch(1, 3000, "x", 1), batch(2, 3100, "x", 2), batch(3, 2900, "x", 3)] })
    );
    assert.equal(even.status, "pass");

    const uneven = checkChapterBalance(
      input({ batches: [batch(1, 500, "x", 1), batch(2, 6000, "x", 2), batch(3, 1200, "x", 3)] })
    );
    assert.equal(uneven.status, "fail");
  });
});

describe("check runner", () => {
  it("returns one result per check and tallies statuses", () => {
    const summary = runManuscriptChecks(input({ batches: [batch(1, 1000, "clean prose")] }));
    assert.equal(summary.results.length, 7);
    assert.equal(
      summary.passed + summary.warned + summary.failed + summary.skipped,
      summary.results.length
    );
  });
});

describe("pricing", () => {
  it("bills the uncached remainder, not the full input, when tokens were cached", () => {
    const rate = MODEL_PRICES["gpt-5.6-sol"];
    const cost = costForUsage("gpt-5.6-sol", {
      inputTokens: 10_000,
      cachedInputTokens: 8_000,
      cacheWriteTokens: 0,
      outputTokens: 1_000,
    });
    // 2k billed as uncached input, 8k at the cached rate, 1k at the output rate.
    assert.ok(Math.abs(cost.inputCost - (2_000 / 1e6) * rate.input) < 1e-9);
    assert.ok(Math.abs(cost.cachedInputCost - (8_000 / 1e6) * rate.cachedInput) < 1e-9);
    assert.ok(Math.abs(cost.outputCost - (1_000 / 1e6) * rate.output) < 1e-9);
  });

  it("applies the cache write premium", () => {
    const cost = costForUsage("gpt-5.6-sol", {
      inputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 1_000_000,
      outputTokens: 0,
    });
    const solRate = MODEL_PRICES["gpt-5.6-sol"];
    assert.ok(Math.abs(cost.cacheWriteCost - solRate.input * 1.25) < 1e-9);
  });

  it("treats cache writes as a subset of input, not an extra charge on top", () => {
    // Shape of a real cold-cache call: the whole prompt is written to cache.
    const cost = costForUsage("gpt-5.6-sol", {
      inputTokens: 100_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 100_000,
      outputTokens: 0,
    });
    // Charged 1.25x once, never 1x input PLUS 1.25x write.
    const solInput = MODEL_PRICES["gpt-5.6-sol"].input;
    assert.equal(cost.inputCost, 0);
    assert.ok(Math.abs(cost.totalCost - (100_000 / 1e6) * solInput * 1.25) < 1e-9);
  });

  it("prices a warm cache far below a cold one for the same prompt", () => {
    const cold = costForUsage("gpt-5.6-sol", {
      inputTokens: 100_000, cachedInputTokens: 0, cacheWriteTokens: 100_000, outputTokens: 0,
    });
    const warm = costForUsage("gpt-5.6-sol", {
      inputTokens: 100_000, cachedInputTokens: 100_000, cacheWriteTokens: 0, outputTokens: 0,
    });
    assert.ok(warm.totalCost < cold.totalCost / 10);
  });

  it("reports an unknown model as unpriced rather than free", () => {
    const cost = costForUsage("some-future-model", {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      outputTokens: 1_000_000,
    });
    assert.equal(cost.priced, false);
    assert.equal(cost.totalCost, 0);
  });

  it("computes cache hit rate and formats small amounts without rounding to zero", () => {
    assert.equal(
      cacheHitRate({ inputTokens: 1000, cachedInputTokens: 750, cacheWriteTokens: 0, outputTokens: 0 }),
      0.75
    );
    assert.equal(
      cacheHitRate({ inputTokens: 0, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 0 }),
      undefined
    );
    assert.equal(formatUsd(0.0023), "$0.0023");
    assert.equal(formatUsd(12.5), "$12.50");
  });
});
