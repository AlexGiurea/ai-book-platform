/**
 * Folio pipeline v3 — pure / in-memory invariant tests.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";

import {
  createPipelineConfig,
  normalizePipelineConfig,
  readEnvModel,
  DEFAULT_ROLE_MODELS,
  PIPELINE_VERSION,
} from "./model-config";
import {
  mergeStoryStateDelta,
  rebuildStoryStateFromDeltas,
  rebuildStoryStateBeforeBatch,
  emptyStoryState,
} from "./story-state";
import { normalizeCriticBatchNumber } from "./critic-agent";
import {
  INITIAL_PLANNING_RUN_ID,
  JobKeys,
  normalizePlanningRunId,
  revisionKeyFor,
} from "./job-keys";
import {
  applyPlanRepairPatch,
  validateBibleInvariants,
} from "./plan-repair-agent";
import { classifyExhaustedJob } from "./job-recovery";
import { getNextBatchAfterQualityGate } from "./quality-continuation";
import { store } from "./context-store";
import type { StateDelta, StoryBible } from "./types";

function validBible(): StoryBible {
  return {
    title: "Test",
    synopsis: "A complete test.",
    premise: "Can the test pass?",
    logline: "A test seeks truth.",
    setting: {
      world: "Lab",
      era: "Now",
      rules: "Deterministic",
      atmosphere: "Focused",
    },
    characters: [],
    themes: ["correctness"],
    structure: {
      actBreakdown: "One act",
      inciting: "Start",
      midpoint: "Check",
      climax: "Assert",
      resolution: "Pass",
    },
    voiceGuide: "Third person",
    styleGuide: "Concise",
    chapters: [
      {
        number: 1,
        title: "First",
        summary: "First half",
        arcPurpose: "Setup",
        openingHook: "Open",
        closingBeat: "Turn",
        batchStart: 1,
        batchEnd: 2,
        targetWords: 5600,
      },
      {
        number: 2,
        title: "Second",
        summary: "Second half",
        arcPurpose: "Resolve",
        openingHook: "Return",
        closingBeat: "End",
        batchStart: 3,
        batchEnd: 4,
        targetWords: 5600,
      },
    ],
    batches: [1, 2, 3, 4].map((number) => ({
      number,
      chapterNumber: number <= 2 ? 1 : 2,
      chapterTitle: number <= 2 ? "First" : "Second",
      positionInChapter:
        number === 1 || number === 3 ? "opening" : "closing",
      purpose: `Purpose ${number}`,
      scenes: [`Scene ${number}`],
      charactersPresent: [],
      settingLocation: "Lab",
      toneNote: "Focused",
      continuityFlags: [],
      targetWords: 2800,
    })),
    threadLedger: [
      {
        id: "test-thread",
        description: "A thread",
        plantBatch: 1,
        resolveByBatch: 4,
      },
    ],
    totalBatches: 4,
    targetWords: 11200,
    createdAt: new Date(0).toISOString(),
  };
}

describe("blank-safe env", () => {
  const keys = [
    "OPENAI_PLANNER_MODEL",
    "OPENAI_WRITER_MODEL_PRO",
    "OPENAI_IMAGE_MODEL",
    "OPENAI_PRO_MODEL",
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      saved[k] = process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("treats empty and whitespace env as undefined", () => {
    process.env.OPENAI_PLANNER_MODEL = "";
    process.env.OPENAI_IMAGE_MODEL = "   ";
    assert.equal(readEnvModel("OPENAI_PLANNER_MODEL"), undefined);
    assert.equal(readEnvModel("OPENAI_IMAGE_MODEL"), undefined);
  });

  it("falls back to non-empty defaults when env is blank", () => {
    process.env.OPENAI_PLANNER_MODEL = "";
    process.env.OPENAI_WRITER_MODEL_PRO = "  ";
    process.env.OPENAI_PRO_MODEL = "";
    process.env.OPENAI_IMAGE_MODEL = "";
    const cfg = createPipelineConfig("pro");
    assert.equal(cfg.models.planner, DEFAULT_ROLE_MODELS.planner);
    assert.equal(cfg.models.writer, DEFAULT_ROLE_MODELS.writer_pro);
    assert.equal(cfg.models.cover, DEFAULT_ROLE_MODELS.cover);
    assert.ok(cfg.models.planner.length > 0);
  });
});

describe("project model snapshot stability", () => {
  it("keeps snapshotted models when process.env changes", () => {
    const snap = createPipelineConfig("pro");
    const prev = process.env.OPENAI_WRITER_MODEL_PRO;
    process.env.OPENAI_WRITER_MODEL_PRO = "gpt-5.6-terra";
    const live = createPipelineConfig("pro");
    assert.equal(live.models.writer, "gpt-5.6-terra");
    const normalized = normalizePipelineConfig(snap, "pro");
    assert.equal(normalized.models.writer, snap.models.writer);
    assert.notEqual(normalized.models.writer, live.models.writer);
    if (prev === undefined) delete process.env.OPENAI_WRITER_MODEL_PRO;
    else process.env.OPENAI_WRITER_MODEL_PRO = prev;
  });

  it("Balanced override only changes writer when revise stays Sol", () => {
    const prevW = process.env.OPENAI_WRITER_MODEL_PRO;
    const prevR = process.env.OPENAI_REVISE_MODEL_PRO;
    process.env.OPENAI_WRITER_MODEL_PRO = "gpt-5.6-terra";
    delete process.env.OPENAI_REVISE_MODEL_PRO;
    const cfg = createPipelineConfig("pro");
    assert.equal(cfg.models.writer, "gpt-5.6-terra");
    assert.equal(cfg.models.revise, DEFAULT_ROLE_MODELS.revise_pro);
    if (prevW === undefined) delete process.env.OPENAI_WRITER_MODEL_PRO;
    else process.env.OPENAI_WRITER_MODEL_PRO = prevW;
    if (prevR === undefined) delete process.env.OPENAI_REVISE_MODEL_PRO;
    else process.env.OPENAI_REVISE_MODEL_PRO = prevR;
  });
});

describe("story state rebuild + exact thread ids", () => {
  it("rebuilds after revision by replacing old delta (not merging over stale)", () => {
    const d1: StateDelta = {
      newFacts: ["fact-a"],
      characterUpdates: [],
      threadsOpened: [{ id: "t1", description: "letter mystery" }],
      threadsResolved: [],
    };
    const d2old: StateDelta = {
      newFacts: ["fact-b-old"],
      characterUpdates: [],
      threadsOpened: [{ id: "t2", description: "old thread" }],
      threadsResolved: [],
    };
    const d2new: StateDelta = {
      newFacts: ["fact-b-new"],
      characterUpdates: [],
      threadsOpened: [],
      threadsResolved: [{ id: "t1" }],
    };
    const afterWrite = rebuildStoryStateFromDeltas([
      { batchNumber: 1, stateDelta: d1 },
      { batchNumber: 2, stateDelta: d2old },
    ]);
    assert.ok(afterWrite.facts.includes("fact-b-old"));
    assert.ok(afterWrite.openThreads.some((t) => t.id === "t2"));

    const afterRevise = rebuildStoryStateFromDeltas([
      { batchNumber: 1, stateDelta: d1 },
      { batchNumber: 2, stateDelta: d2new },
    ]);
    assert.ok(!afterRevise.facts.includes("fact-b-old"));
    assert.ok(afterRevise.facts.includes("fact-b-new"));
    assert.ok(!afterRevise.openThreads.some((t) => t.id === "t1"));
    assert.ok(!afterRevise.openThreads.some((t) => t.id === "t2"));
  });

  it("exact thread ID resolution does not remove similarly named threads", () => {
    let state = emptyStoryState();
    state = mergeStoryStateDelta(state, {
      newFacts: [],
      characterUpdates: [],
      threadsOpened: [
        { id: "letter", description: "the sealed letter" },
        { id: "letter-box", description: "letter box in attic" },
      ],
      threadsResolved: [],
    });
    state = mergeStoryStateDelta(state, {
      newFacts: [],
      characterUpdates: [],
      threadsOpened: [],
      threadsResolved: [{ id: "letter" }],
    });
    assert.equal(state.openThreads.length, 1);
    assert.equal(state.openThreads[0].id, "letter-box");
  });

  it("revise context excludes future batches via before-batch rebuild", () => {
    const batches = [
      {
        batchNumber: 1,
        stateDelta: {
          newFacts: ["early"],
          characterUpdates: [],
          threadsOpened: [],
          threadsResolved: [],
        } satisfies StateDelta,
      },
      {
        batchNumber: 2,
        stateDelta: {
          newFacts: ["mid"],
          characterUpdates: [],
          threadsOpened: [],
          threadsResolved: [],
        } satisfies StateDelta,
      },
      {
        batchNumber: 3,
        stateDelta: {
          newFacts: ["future"],
          characterUpdates: [],
          threadsOpened: [],
          threadsResolved: [],
        } satisfies StateDelta,
      },
    ];
    const before2 = rebuildStoryStateBeforeBatch(batches, 2);
    assert.deepEqual(before2.facts, ["early"]);
    assert.ok(!before2.facts.includes("future"));
    assert.ok(!before2.facts.includes("mid"));
  });
});

describe("critic batch number normalization", () => {
  it("clamps invalid targets to chapter last batch", () => {
    assert.equal(normalizeCriticBatchNumber(99, [4, 5, 6]), 6);
    assert.equal(normalizeCriticBatchNumber(5, [4, 5, 6]), 5);
  });
});

describe("quality-gate chapter continuation", () => {
  it("continues after the chapter end when an early batch was revised", () => {
    const revisedTarget = 7;
    const written = [
      { batchNumber: 7, chapterNumber: 3 },
      { batchNumber: 8, chapterNumber: 3 },
      { batchNumber: 9, chapterNumber: 3 },
    ];
    const next = getNextBatchAfterQualityGate(written, 3);
    assert.equal(next, 10);
    assert.notEqual(next, revisedTarget + 1);
  });

  it("uses the final written batch only for legacy payloads without chapter", () => {
    const written = [
      { batchNumber: 7, chapterNumber: 3 },
      { batchNumber: 9, chapterNumber: 3 },
      { batchNumber: 8, chapterNumber: 3 },
    ];
    assert.equal(getNextBatchAfterQualityGate(written), 10);
    assert.equal(getNextBatchAfterQualityGate(written, 99), undefined);
  });
});

describe("job dedupe keys", () => {
  it("namespaces all planning stages and keeps replan distinct", () => {
    const initial = INITIAL_PLANNING_RUN_ID;
    const replan = "replan:abc123";
    assert.equal(normalizePlanningRunId(undefined), initial);
    assert.equal(JobKeys.plan(initial), "plan:initial");
    assert.equal(JobKeys.planBatches(initial, 1, 10), "plan_batches:initial:1-10");
    assert.equal(JobKeys.planAudit(initial, 1), "plan_audit:initial:1");
    assert.equal(JobKeys.planRepair(initial), "plan_repair:initial:1");
    assert.equal(JobKeys.planAudit(initial, 2), "plan_audit:initial:2");

    assert.equal(JobKeys.plan(replan), "plan:replan:abc123");
    assert.equal(
      JobKeys.planBatches(replan, 1, 10),
      "plan_batches:replan:abc123:1-10"
    );
    assert.equal(JobKeys.planAudit(replan, 1), "plan_audit:replan:abc123:1");
    assert.equal(JobKeys.planRepair(replan), "plan_repair:replan:abc123:1");
    assert.equal(JobKeys.planAudit(replan, 2), "plan_audit:replan:abc123:2");
    assert.notEqual(JobKeys.plan(initial), JobKeys.plan(replan));
  });

  it("keeps manuscript keys deterministic", () => {
    assert.equal(JobKeys.write(1), "write:1");
    assert.equal(JobKeys.critique(3), "critique:3");
    assert.equal(JobKeys.revise(2, 5), "revise:2:5");
    assert.equal(revisionKeyFor(2, 5), "rev:2:5");
  });
});

describe("targeted plan repair safety", () => {
  it("accepts a valid targeted replacement", () => {
    const original = validBible();
    const replacement = {
      ...original.batches[1],
      purpose: "Improved purpose",
    };
    const result = applyPlanRepairPatch(original, {
      chapterReplacements: null,
      batchReplacements: [replacement],
      threadLedgerReplacements: null,
      notes: null,
    });
    assert.equal(result.accepted, true);
    assert.equal(result.bible.batches[1].purpose, "Improved purpose");
    assert.equal(original.batches[1].purpose, "Purpose 2");
  });

  it("rejects invalid coverage and preserves the original plan", () => {
    const original = validBible();
    const invalidChapter = {
      ...original.chapters[1],
      batchStart: 4,
    };
    const result = applyPlanRepairPatch(original, {
      chapterReplacements: [invalidChapter],
      batchReplacements: null,
      threadLedgerReplacements: [
        {
          id: "bad-range",
          description: "Impossible",
          plantBatch: 4,
          resolveByBatch: 2,
        },
      ],
      notes: null,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.bible, original);
    assert.equal(original.chapters[1].batchStart, 3);
    assert.ok(result.errors.some((error) => error.includes("coverage")));
    assert.ok(result.errors.some((error) => error.includes("plant/resolve")));
  });

  it("detects duplicate thread IDs and batch-count mismatch", () => {
    const bible = validBible();
    bible.totalBatches = 5;
    bible.threadLedger?.push({ ...bible.threadLedger[0] });
    const errors = validateBibleInvariants(bible);
    assert.ok(errors.some((error) => error.includes("Batch count")));
    assert.ok(errors.some((error) => error.includes("Duplicate thread id")));
  });
});

describe("memory store idempotency", () => {
  it("stale write replay does not create a second batch", async () => {
    const project = await store.createProject(
      {
        idea: "test",
        preferences: {
          genre: "lit",
          tone: "quiet",
          length: "dev",
          imageStyle: "none",
          pov: "third",
        },
        inputMode: "text",
      },
      undefined,
      "pro"
    );
    assert.equal(project.pipelineVersion, PIPELINE_VERSION);
    assert.ok(project.modelConfig?.models.writer);

    const delta: StateDelta = {
      newFacts: ["f1"],
      characterUpdates: [],
      threadsOpened: [],
      threadsResolved: [],
    };
    const first = await store.appendBatch(project.id, {
      batchNumber: 1,
      prose: "Once upon a time words enough here.",
      chapterNumber: 1,
      chapterTitle: "One",
      chapterSummary: "start",
      stateDelta: delta,
    });
    assert.equal(first?.inserted, true);

    const second = await store.appendBatch(project.id, {
      batchNumber: 1,
      prose: "Different prose that must not replace.",
      chapterNumber: 1,
      chapterTitle: "One",
      chapterSummary: "dup",
      stateDelta: delta,
    });
    assert.equal(second?.inserted, false);
    assert.equal(second?.batch.prose, first?.batch.prose);

    const refreshed = await store.getProject(project.id);
    assert.equal(refreshed?.batches.length, 1);
    assert.equal(refreshed?.totalWords, first?.batch.wordCount);
  });

  it("deterministic job dedupe prevents duplicate next jobs", async () => {
    const project = await store.createProject(
      {
        idea: "dedupe",
        preferences: {
          genre: "",
          tone: "",
          length: "dev",
          imageStyle: "none",
          pov: "",
        },
        inputMode: "text",
      },
      undefined,
      "free"
    );
    const a = await store.enqueueJob(project.id, "write", {
      force: true,
      dedupeKey: JobKeys.write(2),
      payload: { batchNumber: 2 },
    });
    const b = await store.enqueueJob(project.id, "write", {
      force: true,
      dedupeKey: JobKeys.write(2),
      payload: { batchNumber: 2 },
    });
    assert.equal(a.id, b.id);
  });

  it("revision replay skips a second model mutation", async () => {
    const project = await store.createProject(
      {
        idea: "revise",
        preferences: {
          genre: "",
          tone: "",
          length: "dev",
          imageStyle: "none",
          pov: "",
        },
        inputMode: "text",
      },
      undefined,
      "pro"
    );
    await store.appendBatch(project.id, {
      batchNumber: 1,
      prose: "Original batch prose here for testing.",
      chapterSummary: "orig",
      stateDelta: {
        newFacts: ["old"],
        characterUpdates: [],
        threadsOpened: [{ id: "x", description: "x" }],
        threadsResolved: [],
      },
    });
    const key = revisionKeyFor(1, 1);
    const first = await store.replaceBatch(project.id, 1, {
      prose: "Revised batch prose here for testing again.",
      chapterSummary: "rev",
      stateDelta: {
        newFacts: ["new"],
        characterUpdates: [],
        threadsOpened: [],
        threadsResolved: [{ id: "x" }],
      },
      revisionKey: key,
    });
    assert.equal(first?.applied, true);
    const afterFirst = await store.getProject(project.id);
    const totalAfterFirst = afterFirst?.totalWords;

    const second = await store.replaceBatch(project.id, 1, {
      prose: "Should not apply this third prose mutation.",
      chapterSummary: "bad",
      stateDelta: {
        newFacts: ["bad"],
        characterUpdates: [],
        threadsOpened: [],
        threadsResolved: [],
      },
      revisionKey: key,
    });
    assert.equal(second?.applied, false);
    assert.equal(second?.batch.prose, first?.batch.prose);
    const afterReplay = await store.getProject(project.id);
    assert.equal(afterReplay?.totalWords, totalAfterFirst);
    assert.equal(afterReplay?.batches.length, 1);
  });

  it("persists one model config for a legacy memory project", async () => {
    const previous = process.env.OPENAI_WRITER_MODEL_PRO;
    const project = await store.createProject(
      {
        idea: "legacy",
        preferences: {
          genre: "",
          tone: "",
          length: "dev",
          imageStyle: "none",
          pov: "",
        },
        inputMode: "text",
      },
      undefined,
      "pro"
    );
    delete project.modelConfig;
    delete project.pipelineVersion;

    process.env.OPENAI_WRITER_MODEL_PRO = "gpt-5.6-terra";
    const first = await store.ensureProjectPipelineConfig(project.id);
    process.env.OPENAI_WRITER_MODEL_PRO = "gpt-5.6-sol-other";
    const second = await store.ensureProjectPipelineConfig(project.id);
    assert.equal(first?.models.writer, "gpt-5.6-terra");
    assert.deepEqual(second, first);

    if (previous === undefined) delete process.env.OPENAI_WRITER_MODEL_PRO;
    else process.env.OPENAI_WRITER_MODEL_PRO = previous;
  });
});

describe("poison-job recovery decisions", () => {
  it("classifies hard and quality jobs without stranding projects", () => {
    assert.equal(classifyExhaustedJob("plan"), "hard_fail");
    assert.equal(classifyExhaustedJob("plan_batches"), "hard_fail");
    assert.equal(classifyExhaustedJob("write"), "hard_fail");
    assert.equal(classifyExhaustedJob("plan_audit"), "plan_warning");
    assert.equal(classifyExhaustedJob("plan_repair"), "plan_warning");
    assert.equal(classifyExhaustedJob("critique_chapter"), "quality_continue");
    assert.equal(classifyExhaustedJob("revise_batch"), "quality_continue");
    assert.equal(classifyExhaustedJob("verify_revision"), "quality_continue");
    assert.equal(classifyExhaustedJob("cover"), "cover_fail");
  });
});
