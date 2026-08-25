/**
 * The drain loop's stop conditions.
 *
 * This is the thing the cron runs unattended, and every iteration can spend
 * money, so the ways it stops matter more than the way it runs.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { drainGenerationJobs } from "./job-runner";

type Result = Awaited<ReturnType<typeof drainGenerationJobs>>;

/** A runner that reports N jobs done, then an empty queue. */
function runnerFor(outcomes: ("complete" | "failed")[]) {
  let i = 0;
  const calls: { userId?: string; projectId?: string }[] = [];
  const run = async (userId?: string, projectId?: string) => {
    calls.push({ userId, projectId });
    const status = outcomes[i++];
    if (!status) return { processed: false as const };
    return { processed: true as const, status, type: "write" };
  };
  return { run, calls };
}

describe("drain loop", () => {
  it("runs until the queue is empty and says so", async () => {
    const { run } = runnerFor(["complete", "complete", "complete"]);
    const result: Result = await drainGenerationJobs({ run });
    assert.equal(result.processed, 3);
    assert.equal(result.failed, 0);
    assert.equal(result.drained, true, "an empty queue is a drained queue");
  });

  it("counts failures without stopping — one bad job must not strand the rest", async () => {
    const { run } = runnerFor(["complete", "failed", "complete"]);
    const result = await drainGenerationJobs({ run });
    assert.equal(result.processed, 3);
    assert.equal(result.failed, 1);
    assert.equal(result.drained, true);
  });

  it("stops at maxJobs and does NOT claim to have drained", async () => {
    // A job that re-enqueues itself would otherwise spin for the whole function
    // lifetime. Reporting drained:false is what tells the caller work remains.
    const { run } = runnerFor(Array(50).fill("complete"));
    const result = await drainGenerationJobs({ run, maxJobs: 4 });
    assert.equal(result.processed, 4);
    assert.equal(result.drained, false);
  });

  it("stops starting work once the deadline passes", async () => {
    let calls = 0;
    const run = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { processed: true as const, status: "complete" as const };
    };
    const result = await drainGenerationJobs({ run, startDeadlineMs: 50 });
    assert.ok(result.processed >= 2 && result.processed <= 4, `got ${result.processed}`);
    assert.equal(result.drained, false, "out of time is not the same as out of work");
    assert.equal(calls, result.processed);
  });

  it("never starts a job when the deadline has already passed", async () => {
    let calls = 0;
    const run = async () => {
      calls++;
      return { processed: true as const, status: "complete" as const };
    };
    const result = await drainGenerationJobs({ run, startDeadlineMs: 0 });
    assert.equal(calls, 0, "a zero budget must not start work");
    assert.equal(result.processed, 0);
    assert.equal(result.drained, false);
  });

  it("passes its scope through to every claim", async () => {
    const { run, calls } = runnerFor(["complete", "complete"]);
    await drainGenerationJobs({ run, userId: "u1", projectId: "p1" });
    assert.deepEqual(calls, [
      { userId: "u1", projectId: "p1" },
      { userId: "u1", projectId: "p1" },
      { userId: "u1", projectId: "p1" },
    ]);
  });
});
