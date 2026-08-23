/**
 * Writer context window — the invariants that keep full-manuscript context cheap.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_CONTEXT_TOKEN_BUDGET,
  TRUNCATION_BLOCK_BATCHES,
  estimateProseTokens,
  readContextTokenBudget,
  selectManuscriptWindow,
} from "./writer-context";
import { buildWriterUserPrompt } from "./prompts";
import type { Batch, BatchBlueprint, ProjectInput, StoryBible } from "./types";

function batch(n: number, words = 2800): Batch {
  return {
    batchNumber: n,
    chapterNumber: Math.ceil(n / 3),
    chapterTitle: `Chapter ${Math.ceil(n / 3)}`,
    chapterSummary: `Summary of batch ${n}`,
    prose: `PROSE-${n} ${"word ".repeat(20)}`,
    wordCount: words,
    createdAt: new Date(0).toISOString(),
  };
}

function batches(count: number, words = 2800): Batch[] {
  return Array.from({ length: count }, (_, i) => batch(i + 1, words));
}

describe("manuscript window — normal path", () => {
  it("includes the entire manuscript in ascending order", () => {
    const window = selectManuscriptWindow(batches(43));
    assert.equal(window.mode, "full-manuscript");
    assert.equal(window.fullProse.length, 43);
    assert.equal(window.summarized.length, 0);
    assert.equal(window.fullProse[0].batchNumber, 1);
    assert.equal(window.fullProse.at(-1)?.batchNumber, 43);
  });

  it("sorts input rather than trusting caller order", () => {
    const window = selectManuscriptWindow([batch(3), batch(1), batch(2)]);
    assert.deepEqual(
      window.fullProse.map((b) => b.batchNumber),
      [1, 2, 3]
    );
  });

  it("handles the opening batch, where nothing has been written", () => {
    const window = selectManuscriptWindow([]);
    assert.equal(window.fullProse.length, 0);
    assert.equal(window.estimatedTokens, 0);
    assert.equal(window.mode, "full-manuscript");
  });

  it("a full tome stays well inside the budget", () => {
    // 188,000 words is the largest preset; ~67 batches.
    const window = selectManuscriptWindow(batches(67, 3900));
    assert.equal(window.mode, "full-manuscript");
    assert.ok(window.estimatedTokens < DEFAULT_CONTEXT_TOKEN_BUDGET);
  });
});

describe("manuscript window — append-only cache property", () => {
  it("adding a batch leaves every earlier batch byte-identical", () => {
    // This is the whole economic argument: the prefix must not shift, or every
    // call pays full input price instead of the 90%-off cached rate.
    for (let n = 1; n < 12; n++) {
      const before = selectManuscriptWindow(batches(n));
      const after = selectManuscriptWindow(batches(n + 1));
      assert.deepEqual(
        after.fullProse.slice(0, n).map((b) => b.prose),
        before.fullProse.map((b) => b.prose),
        `prefix shifted when appending batch ${n + 1}`
      );
    }
  });

  it("keeps the cut point stable between truncation steps", () => {
    // Budget forces truncation. Within a block the included range must not move.
    const words = 2800;
    const perBatch = estimateProseTokens(batch(1, words));
    const budget = perBatch * 10;

    const first = selectManuscriptWindow(batches(20, words), budget);
    assert.equal(first.mode, "truncated");
    const cut = first.fullProse[0].batchNumber;

    // Appending one more batch should not move the cut every single time.
    const second = selectManuscriptWindow(batches(21, words), budget);
    const third = selectManuscriptWindow(batches(22, words), budget);
    const cuts = new Set([cut, second.fullProse[0].batchNumber, third.fullProse[0].batchNumber]);
    assert.ok(cuts.size <= 2, "cut point moved on every append");
  });
});

describe("manuscript window — truncation guard rail", () => {
  const words = 2800;
  const perBatch = estimateProseTokens(batch(1, words));

  it("drops the oldest batches and keeps the most recent prose", () => {
    const window = selectManuscriptWindow(batches(30, words), perBatch * 10);
    assert.equal(window.mode, "truncated");
    assert.ok(window.summarized.length > 0);
    // Voice continuity lives in the recent prose, so the tail is what survives.
    assert.equal(window.fullProse.at(-1)?.batchNumber, 30);
    assert.equal(window.summarized[0].batchNumber, 1);
  });

  it("partitions every batch exactly once, losing nothing", () => {
    const window = selectManuscriptWindow(batches(30, words), perBatch * 10);
    const seen = [...window.summarized, ...window.fullProse].map((b) => b.batchNumber);
    assert.deepEqual(seen, Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it("advances the cut in whole blocks", () => {
    const window = selectManuscriptWindow(batches(30, words), perBatch * 10);
    assert.equal(window.summarized.length % TRUNCATION_BLOCK_BATCHES, 0);
  });

  it("brings the tail within budget", () => {
    const budget = perBatch * 10;
    const window = selectManuscriptWindow(batches(30, words), budget);
    assert.ok(window.estimatedTokens <= budget);
  });
});

describe("context budget from env", () => {
  it("defaults when unset, invalid, or non-positive", () => {
    assert.equal(readContextTokenBudget({}), DEFAULT_CONTEXT_TOKEN_BUDGET);
    assert.equal(
      readContextTokenBudget({ FOLIO_WRITER_CONTEXT_TOKEN_BUDGET: "  " }),
      DEFAULT_CONTEXT_TOKEN_BUDGET
    );
    assert.equal(
      readContextTokenBudget({ FOLIO_WRITER_CONTEXT_TOKEN_BUDGET: "nonsense" }),
      DEFAULT_CONTEXT_TOKEN_BUDGET
    );
    assert.equal(
      readContextTokenBudget({ FOLIO_WRITER_CONTEXT_TOKEN_BUDGET: "0" }),
      DEFAULT_CONTEXT_TOKEN_BUDGET
    );
  });

  it("honours a valid override", () => {
    assert.equal(
      readContextTokenBudget({ FOLIO_WRITER_CONTEXT_TOKEN_BUDGET: "50000" }),
      50_000
    );
  });
});

describe("writer prompt ordering", () => {
  function minimalBible(): StoryBible {
    return {
      title: "T",
      synopsis: "s",
      premise: "p",
      logline: "l",
      setting: { world: "w", era: "e", rules: "r", atmosphere: "a" },
      characters: [],
      themes: ["t"],
      structure: { actBreakdown: "a", inciting: "i", midpoint: "m", climax: "c", resolution: "r" },
      voiceGuide: "v",
      styleGuide: "s",
      chapters: [],
      batches: [],
      totalBatches: 10,
      targetWords: 28000,
      createdAt: new Date(0).toISOString(),
    };
  }

  function minimalBlueprint(): BatchBlueprint {
    return {
      number: 4,
      chapterNumber: 2,
      chapterTitle: "Two",
      positionInChapter: "middle",
      purpose: "advance",
      scenes: ["a beat"],
      charactersPresent: ["Mara"],
      settingLocation: "somewhere",
      toneNote: "tense",
      continuityFlags: [],
      targetWords: 2800,
    };
  }

  const input: ProjectInput = {
    idea: "an idea",
    preferences: { genre: "g", tone: "t", length: "medium", imageStyle: "none", pov: "third" },
    inputMode: "text",
  };

  it("places the append-only manuscript before per-batch content", () => {
    // Cache-critical. Anything that varies per call must come AFTER the
    // manuscript, or the stable prefix ends early and cache reads collapse.
    const prompt = buildWriterUserPrompt({
      input,
      bible: minimalBible(),
      blueprint: minimalBlueprint(),
      manuscriptBatches: batches(3),
      summarizedBatches: [],
      storyState: { facts: ["f"], characters: [], openThreads: [] },
      isFinalBatch: false,
      totalWords: 8400,
      targetWords: 28000,
    });

    const manuscriptAt = prompt.indexOf("# THE MANUSCRIPT SO FAR");
    const blueprintAt = prompt.indexOf("# BLUEPRINT FOR THIS BATCH");
    const storyStateAt = prompt.indexOf("# STORY STATE");
    const currentStateAt = prompt.indexOf("# CURRENT STATE");

    assert.ok(manuscriptAt > 0, "manuscript section missing");
    assert.ok(manuscriptAt < blueprintAt, "per-batch blueprint precedes manuscript");
    assert.ok(manuscriptAt < storyStateAt, "story state precedes manuscript");
    assert.ok(manuscriptAt < currentStateAt, "current state precedes manuscript");
  });

  it("includes every batch's prose in full, not a summary", () => {
    const prompt = buildWriterUserPrompt({
      input,
      bible: minimalBible(),
      blueprint: minimalBlueprint(),
      manuscriptBatches: batches(3),
      summarizedBatches: [],
      storyState: undefined,
      isFinalBatch: false,
      totalWords: 8400,
      targetWords: 28000,
    });
    for (const n of [1, 2, 3]) {
      assert.ok(prompt.includes(`PROSE-${n}`), `batch ${n} prose missing`);
    }
  });

  it("omits the earlier-chapters summary block entirely when nothing was dropped", () => {
    const prompt = buildWriterUserPrompt({
      input,
      bible: minimalBible(),
      blueprint: minimalBlueprint(),
      manuscriptBatches: batches(3),
      summarizedBatches: [],
      storyState: undefined,
      isFinalBatch: false,
      totalWords: 8400,
      targetWords: 28000,
    });
    assert.ok(!prompt.includes("EARLIER CHAPTERS"));
  });
});
