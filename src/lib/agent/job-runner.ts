import { bookComposer } from "./composer";
import { coverAgent } from "./cover-agent";
import { isGenerationCancelled, toGenerationCancelled } from "./generation-errors";
import { store } from "./context-store";

export async function processNextGenerationJob(userId?: string): Promise<{
  processed: boolean;
  jobId?: string;
  projectId?: string;
  type?: string;
  status?: "complete" | "failed";
  error?: string;
}> {
  const job = await store.claimNextJob(userId);
  if (!job) return { processed: false };

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
    });

    if (job.type === "plan") {
      await bookComposer.planBook(job.projectId);
    } else if (job.type === "plan_batches") {
      await bookComposer.continueBlueprintPlanning(job.projectId);
    } else if (job.type === "write") {
      await bookComposer.writeNextBatch(job.projectId);
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
    if (job.type !== "cover") {
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
