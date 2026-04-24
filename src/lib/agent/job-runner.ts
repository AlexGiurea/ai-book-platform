import { bookComposer } from "./composer";
import { coverAgent } from "./cover-agent";
import { store } from "./context-store";

export async function processNextGenerationJob(): Promise<{
  processed: boolean;
  jobId?: string;
  projectId?: string;
  type?: string;
  status?: "complete" | "failed";
  error?: string;
}> {
  const job = await store.claimNextJob();
  if (!job) return { processed: false };

  try {
    if (job.type === "plan") {
      await bookComposer.planBook(job.projectId);
    } else if (job.type === "write") {
      await bookComposer.writeNextBatch(job.projectId);
    } else if (job.type === "cover") {
      await coverAgent.generateCover(job.projectId);
    } else {
      throw new Error(`Unsupported generation job type: ${job.type}`);
    }

    await store.completeJob(job.id);
    return {
      processed: true,
      jobId: job.id,
      projectId: job.projectId,
      type: job.type,
      status: "complete",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
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
  }
}
