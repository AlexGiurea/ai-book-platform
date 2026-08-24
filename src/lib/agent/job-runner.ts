import { bookComposer } from "./composer";
import { coverAgent } from "./cover-agent";
import { isGenerationCancelled, toGenerationCancelled } from "./generation-errors";
import { JobKeys } from "./job-keys";
import { classifyExhaustedJob } from "./job-recovery";
import { getNextBatchAfterQualityGate } from "./quality-continuation";
import { store } from "./context-store";
import type {
  BookRepairPayload,
  CritiqueChapterPayload,
  PlanAuditPayload,
  PlanJobPayload,
  PlanRepairPayload,
  ReviseBatchPayload,
  VerifyRevisionPayload,
  WriteJobPayload,
} from "./types";

/**
 * Claim and run one queued job.
 *
 * `userId` scopes to one account's projects; `projectId` narrows further to a
 * single book, so two runs can share the queue without stealing each other's
 * work. Both undefined means the global runner (cron).
 */
export async function processNextGenerationJob(
  userId?: string,
  projectId?: string
): Promise<{
  processed: boolean;
  jobId?: string;
  projectId?: string;
  type?: string;
  status?: "complete" | "failed";
  error?: string;
}> {
  const exhausted = await store.reapExhaustedJobs(userId, projectId);
  for (const exhaustedJob of exhausted) {
    await recoverExhaustedJob(exhaustedJob);
  }

  const job = await store.claimNextJob(userId, projectId);
  if (!job) return { processed: false };

  await store.ensureProjectPipelineConfig(job.projectId);
  const preProject = await store.getProject(job.projectId);
  if (preProject?.status === "cancelled") {
    await store.failJob(job.id, "Cancelled");
    return {
      processed: true,
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
      status: "failed",
      error: "Cancelled",
    };
  }

  store.beginGenerationSession(job.projectId);
  try {
    console.info("[generation-job] start", {
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
      attempt: job.attempts,
      dedupeKey: job.dedupeKey,
    });

    if (job.type === "plan") {
      await bookComposer.planBook(
        job.projectId,
        (job.payload ?? {}) as PlanJobPayload
      );
    } else if (job.type === "plan_batches") {
      await bookComposer.continueBlueprintPlanning(
        job.projectId,
        (job.payload ?? {}) as PlanJobPayload
      );
    } else if (job.type === "plan_audit") {
      const payload = (job.payload ?? { pass: 1 }) as PlanAuditPayload;
      await bookComposer.auditPlan(job.projectId, payload);
    } else if (job.type === "plan_repair") {
      const payload = (job.payload ?? {}) as Partial<PlanRepairPayload>;
      await bookComposer.repairPlan(job.projectId, {
        pass: payload.pass,
        planningRunId: payload.planningRunId,
        issues: payload.issues ?? [],
      });
    } else if (job.type === "write") {
      const payload = (job.payload ?? {}) as WriteJobPayload;
      await bookComposer.writeNextBatch(
        job.projectId,
        payload.batchNumber != null ? payload : undefined
      );
    } else if (job.type === "critique_chapter") {
      const payload = (job.payload ?? {}) as CritiqueChapterPayload;
      if (payload.chapterNumber == null) {
        throw new Error("critique_chapter job missing chapterNumber payload");
      }
      await bookComposer.critiqueChapter(job.projectId, payload);
    } else if (job.type === "revise_batch") {
      const payload = (job.payload ?? {}) as ReviseBatchPayload;
      if (payload.batchNumber == null) {
        throw new Error("revise_batch job missing batchNumber payload");
      }
      await bookComposer.reviseBatch(job.projectId, payload);
    } else if (job.type === "verify_revision") {
      const payload = (job.payload ?? {}) as VerifyRevisionPayload;
      if (payload.batchNumber == null) {
        throw new Error("verify_revision job missing batchNumber payload");
      }
      await bookComposer.verifyRevision(job.projectId, payload);
    } else if (job.type === "book_audit") {
      await bookComposer.auditBook(job.projectId);
    } else if (job.type === "book_repair") {
      const payload = (job.payload ?? {}) as BookRepairPayload;
      await bookComposer.repairBook(job.projectId, payload);
    } else if (job.type === "cover") {
      await coverAgent.generateCover(job.projectId);
    } else {
      throw new Error(`Unsupported generation job type: ${job.type}`);
    }

    await store.completeJob(job.id);
    console.info("[generation-job] complete", {
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
    });
    return {
      processed: true,
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
      status: "complete",
    };
  } catch (err) {
    const wasCancelled =
      isGenerationCancelled(err) || toGenerationCancelled(err) !== null;
    if (wasCancelled) {
      await store.failJob(job.id, "Cancelled");
      const p = await store.getProject(job.projectId);
      if (p && p.status !== "cancelled") {
        await store.updateStatus(
          job.projectId,
          "cancelled",
          "Generation stopped."
        );
        await store.appendEvent(job.projectId, { type: "project_cancelled" });
      }
      return {
        processed: true,
        jobId: job.id,
        projectId: job.projectId,
        type: job.type,
        status: "failed",
        error: "Cancelled",
      };
    }

    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generation-job] failed", {
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
      error: msg,
    });
    await store.failJob(job.id, msg);

    const softFail =
      job.type === "cover" ||
      job.type === "book_audit" ||
      job.type === "book_repair" ||
      job.type === "critique_chapter" ||
      job.type === "revise_batch" ||
      job.type === "verify_revision" ||
      job.type === "plan_audit" ||
      job.type === "plan_repair";

    if (softFail) {
      if (
        job.type === "critique_chapter" ||
        job.type === "revise_batch" ||
        job.type === "verify_revision"
      ) {
        try {
          const payload = (job.payload ?? {}) as {
            isFinalChapter?: boolean;
            batchNumber?: number;
            chapterNumber?: number;
          };
          await continueAfterQualityGate(job.projectId, payload);
        } catch (recoverErr) {
          console.warn(
            "[generation-job] soft-fail recovery failed",
            recoverErr instanceof Error ? recoverErr.message : String(recoverErr)
          );
        }
      } else if (job.type === "book_audit" || job.type === "book_repair") {
        // Manuscript already exists; never strand a written book on an audit.
        await finishBookAfterFailure(job.projectId);
      } else if (job.type === "plan_audit" || job.type === "plan_repair") {
        try {
          await store.updateStatus(job.projectId, "awaiting_approval");
        } catch {
          /* ignore */
        }
      }
    } else {
      await store.updateStatus(job.projectId, "failed", msg);
      await store.appendEvent(job.projectId, {
        type: "project_failed",
        error: msg,
      });
    }
    return {
      processed: true,
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
      status: "failed",
      error: msg,
    };
  } finally {
    store.endGenerationSession(job.projectId);
  }
}

async function recoverExhaustedJob(
  job: Awaited<ReturnType<typeof store.reapExhaustedJobs>>[number]
): Promise<void> {
  const message =
    job.error ?? `Exceeded maximum attempts while running ${job.type}`;
  const recovery = classifyExhaustedJob(job.type);

  try {
    if (recovery === "hard_fail") {
      await store.updateStatus(job.projectId, "failed", message);
      await store.appendEvent(job.projectId, {
        type: "project_failed",
        error: message,
      });
      return;
    }

    if (recovery === "plan_warning") {
      await store.appendEvent(job.projectId, {
        type: "plan_audit",
        verdict: "warning",
        error: `${message}; proceeding to human approval.`,
      });
      await store.updateStatus(job.projectId, "awaiting_approval");
      return;
    }

    if (recovery === "finish_book") {
      await finishBookAfterFailure(job.projectId);
      return;
    }

    if (recovery === "cover_fail") {
      await store.updateCoverStatus(job.projectId, "failed", message);
      await store.appendEvent(job.projectId, {
        type: "cover_failed",
        error: message,
      });
      return;
    }

    const payload = (job.payload ?? {}) as {
      isFinalChapter?: boolean;
      batchNumber?: number;
      chapterNumber?: number;
    };
    await continueAfterQualityGate(job.projectId, payload);
  } catch (err) {
    console.warn(
      "[generation-job] exhausted-job recovery failed",
      err instanceof Error ? err.message : String(err)
    );
  }
}

/** Ship a written manuscript when a post-write stage gives out. */
async function finishBookAfterFailure(projectId: string): Promise<void> {
  const project = await store.getProject(projectId);
  if (!project) return;
  if (project.status === "complete") return;
  await store.updateStatus(projectId, "complete");
  await store.appendEvent(projectId, {
    type: "project_complete",
    totalWords: project.totalWords,
  });
}

async function continueAfterQualityGate(
  projectId: string,
  payload: {
    isFinalChapter?: boolean;
    batchNumber?: number;
    chapterNumber?: number;
  }
): Promise<void> {
  const project = await store.getProject(projectId);
  if (!project) return;
  if (payload.isFinalChapter) {
    await store.updateStatus(projectId, "complete");
    await store.appendEvent(projectId, {
      type: "project_complete",
      totalWords: project.totalWords,
    });
    return;
  }

  const nextBatch = getNextBatchAfterQualityGate(
    project.batches,
    payload.chapterNumber
  );
  if (
    nextBatch == null ||
    !project.bible ||
    nextBatch > project.bible.batches.length
  ) {
    await store.updateStatus(projectId, "complete");
    await store.appendEvent(projectId, {
      type: "project_complete",
      totalWords: project.totalWords,
    });
    return;
  }
  await store.enqueueJob(projectId, "write", {
    force: true,
    dedupeKey: JobKeys.write(nextBatch),
    payload: { batchNumber: nextBatch },
  });
}
