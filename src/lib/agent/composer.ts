import { store } from "./context-store";
import { coverAgent } from "./cover-agent";
import { getModelName } from "./openai-client";
import { plannerAgent } from "./planner-agent";
import { writerAgent } from "./writer-agent";

const BATCH_RETRY_ATTEMPTS = 2; // total attempts per batch (1 original + 1 retry)

export class BookComposer {
  /**
   * Phase 1: plan the book. Produces a story bible and parks the project in
   * `awaiting_approval` status so the user can review before writing begins.
   */
  async planBook(projectId: string): Promise<void> {
    const model = getModelName();
    await store.appendEvent(projectId, { type: "project_start", model });
    await store.updateStatus(projectId, "planning");

    try {
      await plannerAgent.generateBible(projectId);
      await store.updateStatus(projectId, "awaiting_approval");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateStatus(projectId, "failed", msg);
      await store.appendEvent(projectId, { type: "project_failed", error: msg, model });
      throw err;
    }
  }

  /**
   * Replan: discard the current bible, generate a fresh one.
   */
  async replan(projectId: string): Promise<void> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const model = getModelName();
    await store.updateStatus(projectId, "planning");
    try {
      await plannerAgent.generateBible(projectId);
      await store.updateStatus(projectId, "awaiting_approval");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateStatus(projectId, "failed", msg);
      await store.appendEvent(projectId, { type: "project_failed", error: msg, model });
      throw err;
    }
  }

  /**
   * Phase 2: write the book batch by batch using the approved bible.
   * Each batch is retried once on failure before the project fails.
   */
  async writeBook(projectId: string): Promise<void> {
    const model = getModelName();
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.bible) throw new Error("Cannot write before a bible exists");

    await store.updateStatus(projectId, "writing");

    try {
      const coverPromise =
        project.input.preferences.imageStyle === "none"
          ? Promise.resolve()
          : coverAgent.generateCover(projectId).catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.warn(`[folio] cover generation failed for ${projectId}: ${msg}`);
            });

      let openThreads: string | undefined = undefined;
      for (const blueprint of project.bible.batches) {
        let lastErr: unknown = undefined;
        let wrote = false;
        for (let attempt = 1; attempt <= BATCH_RETRY_ATTEMPTS; attempt++) {
          try {
            const result = await writerAgent.writeBatch(
              projectId,
              blueprint,
              openThreads
            );
            openThreads = result.openThreads;
            wrote = true;
            break;
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[folio] batch ${blueprint.number} attempt ${attempt} failed: ${msg}`
            );
          }
        }
        if (!wrote) {
          throw lastErr instanceof Error
            ? lastErr
            : new Error(`Batch ${blueprint.number} failed after ${BATCH_RETRY_ATTEMPTS} attempts`);
        }
      }

      await coverPromise;

      await store.updateStatus(projectId, "complete");
      const finalProject = await store.getProject(projectId);
      await store.appendEvent(projectId, {
        type: "project_complete",
        totalWords: finalProject?.totalWords ?? 0,
        model,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateStatus(projectId, "failed", msg);
      await store.appendEvent(projectId, { type: "project_failed", error: msg, model });
      throw err;
    }
  }

  async writeNextBatch(projectId: string): Promise<"queued" | "complete"> {
    const model = getModelName();
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.bible) throw new Error("Cannot write before a bible exists");

    await store.updateStatus(projectId, "writing");

    const blueprint = project.bible.batches[project.batches.length];
    if (!blueprint) {
      await store.updateStatus(projectId, "complete");
      await store.appendEvent(projectId, {
        type: "project_complete",
        totalWords: project.totalWords,
        model,
      });
      return "complete";
    }

    let lastErr: unknown = undefined;
    let wrote = false;
    for (let attempt = 1; attempt <= BATCH_RETRY_ATTEMPTS; attempt++) {
      try {
        await writerAgent.writeBatch(projectId, blueprint, undefined);
        wrote = true;
        break;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[folio] batch ${blueprint.number} attempt ${attempt} failed: ${msg}`
        );
      }
    }

    if (!wrote) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`Batch ${blueprint.number} failed after ${BATCH_RETRY_ATTEMPTS} attempts`);
    }

    const updated = await store.getProject(projectId);
    if (!updated?.bible || updated.batches.length >= updated.bible.batches.length) {
      await store.updateStatus(projectId, "complete");
      await store.appendEvent(projectId, {
        type: "project_complete",
        totalWords: updated?.totalWords ?? 0,
        model,
      });
      return "complete";
    }

    await store.enqueueJob(projectId, "write", { force: true });
    return "queued";
  }

  /**
   * Convenience: plan + write without an approval gate (kept for dev/testing).
   */
  async composeBook(projectId: string): Promise<void> {
    await this.planBook(projectId);
    await this.writeBook(projectId);
  }
}

export const bookComposer = new BookComposer();
