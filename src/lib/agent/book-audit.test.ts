/**
 * Whole-book audit — repair selection and failure containment.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  collectMechanicalFindings,
  renderManuscript,
  selectRepairs,
} from "./book-auditor-agent";
import { JobKeys, MAX_BOOK_REPAIRS } from "./job-keys";
import { classifyExhaustedJob } from "./job-recovery";
import type { Batch, BookProject, StoryBible } from "./types";

type Issue = Parameters<typeof selectRepairs>[0][number];

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    batchNumber: 1,
    severity: "severe",
    description: "a defect",
    fix: "do the thing",
    ...overrides,
  };
}

function batch(n: number, chapter = 1): Batch {
  return {
    batchNumber: n,
    chapterNumber: chapter,
    chapterTitle: `Chapter ${chapter}`,
    chapterSummary: `summary ${n}`,
    prose: `prose ${n}`,
    wordCount: 2800,
    createdAt: new Date(0).toISOString(),
  };
}

describe("repair selection", () => {
  const valid = [1, 2, 3, 4, 5, 6, 7, 8];

  it("drops issues pointing at batches that do not exist", () => {
    const repairs = selectRepairs(
      [issue({ batchNumber: 99 }), issue({ batchNumber: 2 })],
      valid
    );
    assert.equal(repairs.length, 1);
    assert.equal(repairs[0].batchNumber, 2);
  });

  it("keeps only one repair per batch, since a rewrite applies once", () => {
    const repairs = selectRepairs(
      [
        issue({ batchNumber: 3, description: "first" }),
        issue({ batchNumber: 3, description: "second" }),
      ],
      valid
    );
    assert.equal(repairs.length, 1);
    assert.match(repairs[0].description, /first/);
  });

  it("puts severe issues ahead of moderate ones", () => {
    const repairs = selectRepairs(
      [
        issue({ batchNumber: 1, severity: "moderate" }),
        issue({ batchNumber: 2, severity: "severe" }),
      ],
      valid
    );
    assert.equal(repairs[0].batchNumber, 2);
    assert.equal(repairs[0].severity, "severe");
  });

  it("caps the list so a pessimistic audit cannot rewrite the book", () => {
    const many = Array.from({ length: 20 }, (_, i) => issue({ batchNumber: i + 1 }));
    const repairs = selectRepairs(many, Array.from({ length: 20 }, (_, i) => i + 1));
    assert.equal(repairs.length, MAX_BOOK_REPAIRS);
  });

  it("carries the fix into the instruction handed to the writer", () => {
    const repairs = selectRepairs(
      [issue({ batchNumber: 4, description: "Mara's revolver gains rounds", fix: "keep two" })],
      valid
    );
    assert.match(repairs[0].description, /revolver/);
    assert.match(repairs[0].description, /FIX: keep two/);
  });

  it("returns nothing for an empty audit", () => {
    assert.deepEqual(selectRepairs([], valid), []);
  });
});

describe("mechanical findings feed the audit", () => {
  function project(overrides: Partial<BookProject> = {}): BookProject {
    const bible = {
      title: "T",
      synopsis: "s",
      premise: "p",
      logline: "l",
      setting: { world: "w", era: "e", rules: "r", atmosphere: "a" },
      characters: [
        { name: "Mara", role: "protagonist", description: "", voice: "", motivation: "", arc: "", relationships: "" },
        { name: "Ghost", role: "foil", description: "", voice: "", motivation: "", arc: "", relationships: "" },
      ],
      themes: [],
      structure: { actBreakdown: "a", inciting: "i", midpoint: "m", climax: "c", resolution: "r" },
      voiceGuide: "v",
      styleGuide: "s",
      chapters: [],
      batches: [],
      threadLedger: [{ id: "t1", description: "the debt", plantBatch: 1, resolveByBatch: 3 }],
      totalBatches: 3,
      targetWords: 8400,
      createdAt: new Date(0).toISOString(),
    } satisfies StoryBible;

    return {
      id: "p1",
      plan: "pro",
      input: {
        idea: "i",
        preferences: { genre: "g", tone: "t", length: "short", imageStyle: "none", pov: "third" },
        inputMode: "text",
      },
      status: "complete",
      bible,
      storyState: { facts: [], characters: [], openThreads: [{ id: "t1", description: "the debt", openedBatch: 1 }] },
      batches: [
        {
          ...batch(1),
          prose: "Mara walked on.",
          stateDelta: {
            newFacts: [],
            characterUpdates: [],
            threadsOpened: [{ id: "t1", description: "the debt" }],
            threadsResolved: [],
          },
        },
      ],
      events: [],
      targetWords: 8400,
      totalWords: 2800,
      expectedBatches: 3,
      coverStatus: "pending",
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      ...overrides,
    } as BookProject;
  }

  it("reports an unresolved thread and a character who never reached the page", () => {
    const { findings, unresolvedThreadCount } = collectMechanicalFindings(project());
    assert.ok(unresolvedThreadCount >= 1);
    const joined = findings.join(" ");
    assert.match(joined, /t1/);
    assert.match(joined, /Ghost/);
  });

  it("says nothing when the deterministic checks are clean", () => {
    const clean = project({
      storyState: { facts: [], characters: [], openThreads: [] },
      batches: [
        {
          ...batch(1),
          prose: "Mara walked on. Ghost followed.",
          stateDelta: {
            newFacts: [],
            characterUpdates: [],
            threadsOpened: [{ id: "t1", description: "the debt" }],
            threadsResolved: [],
          },
        },
      ],
    });
    const { findings, unresolvedThreadCount } = collectMechanicalFindings(clean);
    assert.deepEqual(findings, []);
    assert.equal(unresolvedThreadCount, 0);
  });
});

describe("manuscript rendering", () => {
  it("emits one chapter heading per chapter, in order", () => {
    const rendered = renderManuscript([batch(3, 2), batch(1, 1), batch(2, 1)]);
    assert.equal(rendered.match(/## Chapter 1/g)?.length, 1);
    assert.equal(rendered.match(/## Chapter 2/g)?.length, 1);
    assert.ok(rendered.indexOf("prose 1") < rendered.indexOf("prose 3"));
  });
});

describe("audit failure containment", () => {
  it("never strands a written manuscript when a post-write stage gives out", () => {
    // The book exists by this point; failing the project would destroy it.
    assert.equal(classifyExhaustedJob("book_audit"), "finish_book");
    assert.equal(classifyExhaustedJob("book_repair"), "finish_book");
  });

  it("still hard-fails the stages that run before any prose exists", () => {
    assert.equal(classifyExhaustedJob("plan"), "hard_fail");
    assert.equal(classifyExhaustedJob("write"), "hard_fail");
  });

  it("gives each repair a distinct job key", () => {
    const keys = new Set([JobKeys.bookRepair(0), JobKeys.bookRepair(1), JobKeys.bookRepair(2)]);
    assert.equal(keys.size, 3);
    assert.equal(JobKeys.bookAudit(1), "book_audit:1");
  });
});
