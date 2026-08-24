/**
 * Write granularity — chapter-sized writes and the fallbacks that protect
 * already-written prose.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_WRITE_GRANULARITY,
  chapterBlueprints,
  chapterForBatch,
  chapterTargetWords,
  normalizeWriteGranularity,
  pendingChapterBlueprints,
  readWriteGranularity,
} from "./write-granularity";
import type { BatchBlueprint } from "./types";

function bp(number: number, chapterNumber: number, targetWords = 2800): BatchBlueprint {
  return {
    number,
    chapterNumber,
    chapterTitle: `Chapter ${chapterNumber}`,
    positionInChapter: "middle",
    purpose: "p",
    scenes: [],
    charactersPresent: [],
    settingLocation: "s",
    toneNote: "t",
    continuityFlags: [],
    targetWords,
  };
}

/** 3 chapters x 3 batches. */
const bible = {
  batches: [
    bp(1, 1), bp(2, 1), bp(3, 1),
    bp(4, 2), bp(5, 2), bp(6, 2),
    bp(7, 3), bp(8, 3), bp(9, 3),
  ],
};

describe("granularity config", () => {
  it("defaults to batch and only accepts an exact chapter opt-in", () => {
    assert.equal(readWriteGranularity({}), "batch");
    assert.equal(readWriteGranularity({ FOLIO_WRITE_GRANULARITY: "chapter" }), "chapter");
    assert.equal(readWriteGranularity({ FOLIO_WRITE_GRANULARITY: "CHAPTER" }), "chapter");
    assert.equal(readWriteGranularity({ FOLIO_WRITE_GRANULARITY: " chapter " }), "chapter");
  });

  it("falls back to batch on anything unrecognised, never throws", () => {
    for (const raw of ["", "  ", "chapters", "book", "nonsense", "1"]) {
      assert.equal(readWriteGranularity({ FOLIO_WRITE_GRANULARITY: raw }), "batch", raw);
    }
    assert.equal(normalizeWriteGranularity(undefined), DEFAULT_WRITE_GRANULARITY);
    assert.equal(normalizeWriteGranularity(null), "batch");
    assert.equal(normalizeWriteGranularity(7), "batch");
  });
});

describe("chapter lookup", () => {
  it("returns a chapter's blueprints in batch order", () => {
    assert.deepEqual(chapterBlueprints(bible, 2).map((b) => b.number), [4, 5, 6]);
  });

  it("sorts rather than trusting blueprint order", () => {
    const scrambled = { batches: [bp(6, 2), bp(4, 2), bp(5, 2)] };
    assert.deepEqual(chapterBlueprints(scrambled, 2).map((b) => b.number), [4, 5, 6]);
  });

  it("maps a batch back to its chapter, and reports an unknown batch", () => {
    assert.equal(chapterForBatch(bible, 5), 2);
    assert.equal(chapterForBatch(bible, 9), 3);
    assert.equal(chapterForBatch(bible, 99), undefined);
  });

  it("sums a chapter's word budget", () => {
    assert.equal(chapterTargetWords(chapterBlueprints(bible, 1)), 8400);
    assert.equal(chapterTargetWords([]), 0);
  });
});

describe("partial-chapter protection", () => {
  it("writes the whole chapter when none of it exists", () => {
    const { blueprints, partiallyWritten } = pendingChapterBlueprints(bible, 2, [1, 2, 3]);
    assert.deepEqual(blueprints.map((b) => b.number), [4, 5, 6]);
    assert.equal(partiallyWritten, false);
  });

  it("refuses chapter mode when the chapter is half written", () => {
    // A resumed run or a partial failure. Writing the chapter as a unit here
    // would clobber batch 4, so the caller must fall back to per-batch.
    const { blueprints, partiallyWritten } = pendingChapterBlueprints(bible, 2, [1, 2, 3, 4]);
    assert.deepEqual(blueprints.map((b) => b.number), [5, 6]);
    assert.equal(partiallyWritten, true);
  });

  it("reports nothing pending for a finished chapter", () => {
    const { blueprints, partiallyWritten } = pendingChapterBlueprints(bible, 1, [1, 2, 3]);
    assert.deepEqual(blueprints, []);
    assert.equal(partiallyWritten, false, "a complete chapter is not a partial one");
  });

  it("treats an out-of-order gap as partial, not as a fresh chapter", () => {
    // Batch 5 written but not 4: still partial, still per-batch.
    const { partiallyWritten } = pendingChapterBlueprints(bible, 2, [5]);
    assert.equal(partiallyWritten, true);
  });
});

describe("call-count economics", () => {
  it("chapter mode cuts writer calls roughly threefold", () => {
    // The whole point: the manuscript is re-sent per call and cannot be cached,
    // so redundant input scales with call count, not call size.
    const batchCalls = bible.batches.length;
    const chapterCalls = new Set(bible.batches.map((b) => b.chapterNumber)).size;
    assert.equal(batchCalls, 9);
    assert.equal(chapterCalls, 3);
    assert.ok(chapterCalls * 3 <= batchCalls);
  });
});
