/**
 * Length guidance — drift correction and the clamps that keep it sane.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_TARGET_RATIO,
  MIN_TARGET_RATIO,
  computeLengthGuidance,
} from "./length-guidance";

/** The measured production shape: 40k book, 14 batches, 2,800-word targets. */
function guidance(overrides: Partial<Parameters<typeof computeLengthGuidance>[0]> = {}) {
  return computeLengthGuidance({
    blueprintTargetWords: 2800,
    batchNumber: 5,
    totalBatches: 14,
    wordsSoFar: 11_428,
    bookTargetWords: 40_000,
    ...overrides,
  });
}

describe("length guidance — on plan", () => {
  it("asks for roughly the blueprint figure and says nothing about drift", () => {
    const g = guidance();
    assert.ok(Math.abs(g.driftRatio - 1) < 0.01);
    assert.equal(g.correction, undefined);
    assert.ok(g.targetWords > 2700 && g.targetWords < 3000);
  });

  it("brackets the target with a symmetric range", () => {
    const g = guidance();
    assert.ok(g.minWords < g.targetWords);
    assert.ok(g.maxWords > g.targetWords);
    assert.equal(g.minWords, Math.round(g.targetWords * 0.9));
    assert.equal(g.maxWords, Math.round(g.targetWords * 1.1));
  });
});

describe("length guidance — the measured overrun", () => {
  it("detects a 35% overrun and demands a shorter batch", () => {
    // Four batches at the measured ~3,900 words each.
    const g = guidance({ wordsSoFar: 15_600 });
    assert.ok(g.driftRatio > 1.3, `drift was ${g.driftRatio}`);
    assert.match(g.correction ?? "", /LONG/);
    assert.ok(
      g.targetWords < 2800,
      `expected a corrective target below 2800, got ${g.targetWords}`
    );
  });

  it("pays the overrun back across the remaining batches, not all at once", () => {
    const g = guidance({ wordsSoFar: 15_600 });
    // 24,400 words left over 10 batches = 2,440.
    assert.equal(g.targetWords, 2440);
  });

  it("asks for the floor once the book is already past its target", () => {
    const g = guidance({ wordsSoFar: 45_000 });
    assert.equal(g.targetWords, Math.round(2800 * MIN_TARGET_RATIO));
    assert.match(g.correction ?? "", /LONG/);
  });
});

describe("length guidance — running short", () => {
  it("reports a short book and asks for the fuller end of the range", () => {
    const g = guidance({ wordsSoFar: 7000 });
    assert.ok(g.driftRatio < 0.7);
    assert.match(g.correction ?? "", /SHORT/);
    assert.ok(g.targetWords > 2800);
  });
});

describe("length guidance — clamps and edges", () => {
  it("never demands an absurdly short batch, however drifted", () => {
    const g = guidance({ batchNumber: 13, wordsSoFar: 39_000 });
    assert.ok(g.targetWords >= 2800 * MIN_TARGET_RATIO);
  });

  it("never demands an absurdly long batch, however far behind", () => {
    const g = guidance({ batchNumber: 13, wordsSoFar: 1000 });
    assert.ok(g.targetWords <= 2800 * MAX_TARGET_RATIO);
  });

  it("treats the opening batch as on plan instead of dividing by zero", () => {
    const g = guidance({ batchNumber: 1, wordsSoFar: 0 });
    assert.equal(g.driftRatio, 1);
    assert.equal(g.correction, undefined);
    assert.ok(Number.isFinite(g.targetWords));
  });

  it("falls back to a sane base when the blueprint carries no target", () => {
    const g = guidance({ blueprintTargetWords: 0 });
    assert.ok(g.targetWords >= 2100 && g.targetWords <= 3080);
  });

  it("survives a zero or negative batch count", () => {
    for (const totalBatches of [0, -3]) {
      const g = guidance({ totalBatches });
      assert.ok(Number.isFinite(g.targetWords));
      assert.ok(g.targetWords > 0);
    }
  });

  it("stays finite on the final batch", () => {
    const g = guidance({ batchNumber: 14, wordsSoFar: 36_000 });
    assert.ok(Number.isFinite(g.targetWords));
    assert.ok(g.targetWords > 0);
  });
});

describe("length guidance — correction wording", () => {
  it("protects scene beats in both directions", () => {
    const long = guidance({ wordsSoFar: 15_600 }).correction ?? "";
    const short = guidance({ wordsSoFar: 7000 }).correction ?? "";
    assert.match(long, /not scene beats/);
    assert.match(short, /rather than adding new ones/);
  });

  it("stays quiet for drift inside the noise threshold", () => {
    // ~3% over: real but not worth an instruction.
    assert.equal(guidance({ wordsSoFar: 11_770 }).correction, undefined);
  });
});
