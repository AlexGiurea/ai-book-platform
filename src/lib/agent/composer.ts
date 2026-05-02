import { store, WORDS_PER_BATCH } from "./context-store";
import { coverAgent } from "./cover-agent";
import { isGenerationCancelled } from "./generation-errors";
import { getModelName } from "./openai-client";
import { MONOLITHIC_PLAN_BATCH_CAP, plannerAgent } from "./planner-agent";
import { writerAgent } from "./writer-agent";

const BATCH_RETRY_ATTEMPTS = 2; // total attempts per batch (1 original + 1 retry)

export class BookComposer {
  /**
   * Phase 1: plan the book. Produces a story bible and parks the project in
   * `awaiting_approval` status so the user can review before writing begins.
   */
  async planBook(projectId: string): Promise<void> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const model = getModelName(project.plan);
    await store.assertNotCancelled(projectId);
    await store.appendEvent(projectId, { type: "project_start", model });
    await store.updateStatus(projectId, "planning");

    try {
      const totalBatches = Math.max(1, Math.round(project.targetWords / WORDS_PER_BATCH));

      if (totalBatches <= MONOLITHIC_PLAN_BATCH_CAP) {
        await plannerAgent.generateBibleMonolithic(projectId);
      } else {
        await plannerAgent.generateBibleSpine(projectId);
        await store.assertNotCancelled(projectId);
        await store.enqueueJob(projectId, "plan_batches");
      }
      await store.assertNotCancelled(projectId);

      const after = await store.getProject(projectId);
      if (after?.bible && after.bible.batches.length >= after.bible.totalBatches) {
        await store.updateStatus(projectId, "awaiting_approval");
      }
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
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
    const model = getModelName(project.plan);
    await store.assertNotCancelled(projectId);
    await store.updateStatus(projectId, "planning");
    try {
      const totalBatches = Math.max(1, Math.round(project.targetWords / WORDS_PER_BATCH));

      if (totalBatches <= MONOLITHIC_PLAN_BATCH_CAP) {
        await plannerAgent.generateBibleMonolithic(projectId);
      } else {
        await plannerAgent.generateBibleSpine(projectId);
        await store.assertNotCancelled(projectId);
        await store.enqueueJob(projectId, "plan_batches");
      }
      await store.assertNotCancelled(projectId);

      const after = await store.getProject(projectId);
      if (after?.bible && after.bible.batches.length >= after.bible.totalBatches) {
        await store.updateStatus(projectId, "awaiting_approval");
      }
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateStatus(projectId, "failed", msg);
      await store.appendEvent(projectId, { type: "project_failed", error: msg, model });
      throw err;
    }
  }

  /** Continuation job for staged spine → batch blueprints. */
  async continueBlueprintPlanning(projectId: string): Promise<void> {
    const project = await store.getProject(projectId);
    if (!project?.bible) {
      throw new Error(`Blueprint planning cannot continue — no bible loaded for ${projectId}`);
    }
    if (
      project.bible.batches.length >= project.bible.totalBatches &&
      project.status !== "awaiting_approval"
    ) {
      await store.updateStatus(projectId, "awaiting_approval");
      return;
    }

    try {
      const done = await plannerAgent.appendBlueprintSegment(projectId);
      if (!done) {
        await store.enqueueJob(projectId, "plan_batches", { force: true });
      } else {
        await store.updateStatus(projectId, "awaiting_approval");
      }
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const model = getModelName(project.plan);
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
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const model = getModelName(project.plan);
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
        await store.assertNotCancelled(projectId);
        let lastErr: unknown = undefined;
        let wrote = false;
        for (let attempt = 1; attempt <= BATCH_RETRY_ATTEMPTS; attempt++) {
          try {
            await store.assertNotCancelled(projectId);
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
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateStatus(projectId, "failed", msg);
      await store.appendEvent(projectId, { type: "project_failed", error: msg, model });
      throw err;
    }
  }

  async writeNextBatch(projectId: string): Promise<"queued" | "complete"> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const model = getModelName(project.plan);
    if (!project.bible) throw new Error("Cannot write before a bible exists");

    await store.assertNotCancelled(projectId);
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
        await store.assertNotCancelled(projectId);
        await writerAgent.writeBatch(projectId, blueprint, undefined);
        wrote = true;
        break;
      } catch (err) {
        if (isGenerationCancelled(err)) throw err;
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
    for (let i = 0; i < 120; i++) {
      const p = await store.getProject(projectId);
      if (!p?.bible) throw new Error("composeBook: bible missing after plan");
      if (p.status === "failed")
        throw new Error(p.error ?? "Planning failed");
      if (p.bible.batches.length >= p.bible.totalBatches) break;
      await plannerAgent.appendBlueprintSegment(projectId);
    }
    const ready = await store.getProject(projectId);
    if (ready?.bible && ready.bible.batches.length < ready.bible.totalBatches) {
      throw new Error("composeBook: staged planning did not finish");
    }
    await this.writeBook(projectId);
  }
}

export const bookComposer = new BookComposer();
