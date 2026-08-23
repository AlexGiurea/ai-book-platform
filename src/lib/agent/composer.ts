import { store, WORDS_PER_BATCH } from "./context-store";
import { coverAgent } from "./cover-agent";
import { criticAgent } from "./critic-agent";
import { isGenerationCancelled } from "./generation-errors";
import {
  INITIAL_PLANNING_RUN_ID,
  JobKeys,
  MAX_REVISION_ATTEMPTS,
  normalizePlanningRunId,
  revisionKeyFor,
} from "./job-keys";
import { getModelForProject } from "./openai-client";
import { BLUEPRINT_SEGMENT_BATCH_COUNT, MONOLITHIC_PLAN_BATCH_CAP, plannerAgent } from "./planner-agent";
import { planAuditorAgent } from "./plan-auditor-agent";
import { planRepairAgent } from "./plan-repair-agent";
import { getNextBatchAfterQualityGate } from "./quality-continuation";
import { reviseAgent } from "./revise-agent";
import { revisionVerifierAgent } from "./revision-verifier-agent";
import type {
  CritiqueChapterPayload,
  PlanAuditPayload,
  PlanJobPayload,
  PlanRepairPayload,
  ReviseBatchPayload,
  VerifyRevisionPayload,
  WriteJobPayload,
} from "./types";
import { writerAgent } from "./writer-agent";

const BATCH_RETRY_ATTEMPTS = 2; // total attempts per batch (1 original + 1 retry)

function isChapterClosingPosition(
  position: "opening" | "middle" | "closing" | "single"
): boolean {
  return position === "closing" || position === "single";
}

function nextMissingBatchNumber(
  bibleBatchCount: number,
  written: { batchNumber: number }[]
): number | null {
  const present = new Set(written.map((b) => b.batchNumber));
  for (let n = 1; n <= bibleBatchCount; n++) {
    if (!present.has(n)) return n;
  }
  return null;
}

export class BookComposer {
  /**
   * Phase 1: plan the book. After planning finishes, enqueue plan_audit
   * (do not set awaiting_approval until audit completes).
   */
  async planBook(
    projectId: string,
    payload: PlanJobPayload = {}
  ): Promise<void> {
    const planningRunId = normalizePlanningRunId(payload.planningRunId);
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const model = getModelForProject(project, "planner");
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
        const start = 1;
        const end = Math.min(BLUEPRINT_SEGMENT_BATCH_COUNT, totalBatches);
        await store.enqueueJob(projectId, "plan_batches", {
          force: true,
          dedupeKey: JobKeys.planBatches(planningRunId, start, end),
          payload: { planningRunId } satisfies PlanJobPayload,
        });
        return;
      }
      await store.assertNotCancelled(projectId);

      const after = await store.getProject(projectId);
      if (after?.bible && after.bible.batches.length >= after.bible.totalBatches) {
        await store.enqueueJob(projectId, "plan_audit", {
          force: true,
          dedupeKey: JobKeys.planAudit(planningRunId, 1),
          payload: { pass: 1, planningRunId } satisfies PlanAuditPayload,
        });
      }
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateStatus(projectId, "failed", msg);
      await store.appendEvent(projectId, { type: "project_failed", error: msg, model });
      throw err;
    }
  }

  async replan(
    projectId: string,
    payload: PlanJobPayload = {
      planningRunId: INITIAL_PLANNING_RUN_ID,
    }
  ): Promise<void> {
    return this.planBook(projectId, payload);
  }

  /** Continuation job for staged spine → batch blueprints. */
  async continueBlueprintPlanning(
    projectId: string,
    payload: PlanJobPayload = {}
  ): Promise<void> {
    const planningRunId = normalizePlanningRunId(payload.planningRunId);
    const project = await store.getProject(projectId);
    if (!project?.bible) {
      throw new Error(`Blueprint planning cannot continue — no bible loaded for ${projectId}`);
    }
    if (
      project.bible.batches.length >= project.bible.totalBatches
    ) {
      await store.enqueueJob(projectId, "plan_audit", {
        force: true,
        dedupeKey: JobKeys.planAudit(planningRunId, 1),
        payload: { pass: 1, planningRunId } satisfies PlanAuditPayload,
      });
      return;
    }

    try {
      const nextStart = project.bible.batches.length + 1;
      const done = await plannerAgent.appendBlueprintSegment(projectId);
      if (!done) {
        const refreshed = await store.getProject(projectId);
        const start = (refreshed?.bible?.batches.length ?? nextStart - 1) + 1;
        const end = Math.min(
          start + BLUEPRINT_SEGMENT_BATCH_COUNT - 1,
          refreshed?.bible?.totalBatches ?? start
        );
        await store.enqueueJob(projectId, "plan_batches", {
          force: true,
          dedupeKey: JobKeys.planBatches(planningRunId, start, end),
          payload: { planningRunId } satisfies PlanJobPayload,
        });
      } else {
        await store.enqueueJob(projectId, "plan_audit", {
          force: true,
          dedupeKey: JobKeys.planAudit(planningRunId, 1),
          payload: { pass: 1, planningRunId } satisfies PlanAuditPayload,
        });
      }
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const model = getModelForProject(project, "planner");
      const msg = err instanceof Error ? err.message : String(err);
      await store.updateStatus(projectId, "failed", msg);
      await store.appendEvent(projectId, { type: "project_failed", error: msg, model });
      throw err;
    }
  }

  /** Plan audit before awaiting_approval. */
  async auditPlan(
    projectId: string,
    payload: PlanAuditPayload = { pass: 1 }
  ): Promise<void> {
    const planningRunId = normalizePlanningRunId(payload.planningRunId);
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);
    await store.assertNotCancelled(projectId);

    try {
      const result = await planAuditorAgent.auditPlan(projectId);
      if (result.verdict === "repair" && payload.pass === 1) {
        const issues = result.issues
          .filter((issue) => issue.severity === "high")
          .slice(0, 20);
        await store.enqueueJob(projectId, "plan_repair", {
          force: true,
          dedupeKey: JobKeys.planRepair(planningRunId),
          payload: {
            pass: 1,
            planningRunId,
            issues,
          } satisfies PlanRepairPayload,
        });
        return;
      }
      // pass, or post-repair verification with remaining issues → human approval
      if (result.verdict === "repair" && payload.pass > 1) {
        await store.appendEvent(projectId, {
          type: "plan_audit",
          verdict: "warning",
          issueCount: result.issues.length,
          error: "Plan audit still flagged issues after repair; proceeding to approval.",
        });
      }
      await store.updateStatus(projectId, "awaiting_approval");
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[folio] plan_audit failed (proceeding to approval): ${msg}`);
      await store.appendEvent(projectId, {
        type: "plan_audit",
        verdict: "warning",
        error: msg,
      });
      await store.updateStatus(projectId, "awaiting_approval");
    }
  }

  async repairPlan(
    projectId: string,
    payload: PlanRepairPayload
  ): Promise<void> {
    const planningRunId = normalizePlanningRunId(payload.planningRunId);
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);
    await store.assertNotCancelled(projectId);

    try {
      await planRepairAgent.repairPlan(projectId, payload);
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[folio] plan_repair failed (proceeding to re-audit): ${msg}`);
      await store.appendEvent(projectId, {
        type: "plan_repaired",
        error: msg,
      });
    }

    // One verification audit pass after repair — never loop repairs.
    await store.enqueueJob(projectId, "plan_audit", {
      force: true,
      dedupeKey: JobKeys.planAudit(planningRunId, 2),
      payload: { pass: 2, planningRunId } satisfies PlanAuditPayload,
    });
  }

  /**
   * In-process path — used by composeBook / tests.
   */
  async writeBook(projectId: string): Promise<void> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const model = getModelForProject(project, "writer");
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

      for (const blueprint of project.bible.batches) {
        await store.assertNotCancelled(projectId);
        let lastErr: unknown = undefined;
        let wrote = false;
        for (let attempt = 1; attempt <= BATCH_RETRY_ATTEMPTS; attempt++) {
          try {
            await store.assertNotCancelled(projectId);
            await writerAgent.writeBatch(projectId, blueprint);
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

  private async completeProject(projectId: string, model: string): Promise<"complete"> {
    await store.updateStatus(projectId, "complete");
    const finalProject = await store.getProject(projectId);
    await store.appendEvent(projectId, {
      type: "project_complete",
      totalWords: finalProject?.totalWords ?? 0,
      model,
    });
    return "complete";
  }

  private async enqueueWriteOrComplete(
    projectId: string,
    model: string,
    nextBatchNumber: number
  ): Promise<"queued" | "complete"> {
    const updated = await store.getProject(projectId);
    if (!updated?.bible) {
      return this.completeProject(projectId, model);
    }
    if (nextBatchNumber > updated.bible.batches.length) {
      return this.completeProject(projectId, model);
    }
    await store.enqueueJob(projectId, "write", {
      force: true,
      dedupeKey: JobKeys.write(nextBatchNumber),
      payload: { batchNumber: nextBatchNumber } satisfies WriteJobPayload,
    });
    return "queued";
  }

  /**
   * Write absolute batch from payload.batchNumber (or derive next missing for legacy jobs).
   */
  async writeNextBatch(
    projectId: string,
    payload?: WriteJobPayload
  ): Promise<"queued" | "complete"> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const model = getModelForProject(project, "writer");
    if (!project.bible) throw new Error("Cannot write before a bible exists");

    await store.assertNotCancelled(projectId);
    await store.updateStatus(projectId, "writing");

    let batchNumber = payload?.batchNumber;
    if (batchNumber == null || !Number.isFinite(batchNumber) || batchNumber < 1) {
      // Legacy write jobs: derive next missing batch once.
      const missing = nextMissingBatchNumber(
        project.bible.batches.length,
        project.batches
      );
      if (missing == null) {
        return this.completeProject(projectId, model);
      }
      batchNumber = missing;
    }

    const blueprint = project.bible.batches[batchNumber - 1];
    if (!blueprint || blueprint.number !== batchNumber) {
      // Fall back to find by number
      const found = project.bible.batches.find((b) => b.number === batchNumber);
      if (!found) {
        return this.completeProject(projectId, model);
      }
      return this.writeAbsoluteBatch(projectId, found.number, model);
    }

    return this.writeAbsoluteBatch(projectId, batchNumber, model);
  }

  private async writeAbsoluteBatch(
    projectId: string,
    batchNumber: number,
    model: string
  ): Promise<"queued" | "complete"> {
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error("Cannot write before a bible exists");

    const blueprint =
      project.bible.batches.find((b) => b.number === batchNumber) ??
      project.bible.batches[batchNumber - 1];
    if (!blueprint) {
      return this.completeProject(projectId, model);
    }

    // Idempotent replay: batch already present → skip model, continue orchestration.
    const existing = project.batches.find((b) => b.batchNumber === batchNumber);
    if (!existing) {
      let lastErr: unknown = undefined;
      let wrote = false;
      for (let attempt = 1; attempt <= BATCH_RETRY_ATTEMPTS; attempt++) {
        try {
          await store.assertNotCancelled(projectId);
          await writerAgent.writeBatch(projectId, blueprint);
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
    }

    const updated = await store.getProject(projectId);
    const isFinalBatch =
      !updated?.bible || batchNumber >= updated.bible.batches.length;
    const closesChapter = isChapterClosingPosition(blueprint.positionInChapter);

    if (closesChapter || isFinalBatch) {
      await store.enqueueJob(projectId, "critique_chapter", {
        force: true,
        dedupeKey: JobKeys.critique(blueprint.chapterNumber),
        payload: {
          chapterNumber: blueprint.chapterNumber,
          isFinalChapter: isFinalBatch,
        } satisfies CritiqueChapterPayload,
      });
      return "queued";
    }

    const next = batchNumber + 1;
    await store.enqueueJob(projectId, "write", {
      force: true,
      dedupeKey: JobKeys.write(next),
      payload: { batchNumber: next } satisfies WriteJobPayload,
    });
    return "queued";
  }

  async critiqueChapter(
    projectId: string,
    payload: CritiqueChapterPayload
  ): Promise<"queued" | "complete"> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const writerModel = getModelForProject(project, "writer");

    await store.assertNotCancelled(projectId);
    await store.updateStatus(projectId, "writing");

    const chapterBatches = project.batches.filter(
      (b) => b.chapterNumber === payload.chapterNumber
    );
    const nextAfterChapter = getNextBatchAfterQualityGate(
      project.batches,
      payload.chapterNumber
    );

    try {
      const critique = await criticAgent.critiqueChapter(
        projectId,
        payload.chapterNumber
      );

      if (critique.verdict === "revise") {
        const highIssues = critique.issues.filter((i) => i.severity === "high");
        const preferredIssues =
          highIssues.length > 0 ? highIssues : critique.issues;
        let flagged =
          preferredIssues[0]?.batchNumber ??
          chapterBatches.at(-1)?.batchNumber;

        if (flagged != null) {
          const allowed = new Set(chapterBatches.map((b) => b.batchNumber));
          if (!allowed.has(flagged)) {
            flagged = chapterBatches.at(-1)?.batchNumber ?? flagged;
          }
          const revKey = revisionKeyFor(payload.chapterNumber, flagged, 1);
          await store.enqueueJob(projectId, "revise_batch", {
            force: true,
            dedupeKey: JobKeys.revise(payload.chapterNumber, flagged, 1),
            payload: {
              batchNumber: flagged,
              chapterNumber: payload.chapterNumber,
              issues: critique.issues,
              beatsMissed: critique.beatsMissed,
              isFinalChapter: payload.isFinalChapter,
              revisionKey: revKey,
              revisionAttempt: 1,
            } satisfies ReviseBatchPayload,
          });
          return "queued";
        }
      }
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[folio] critique_chapter failed (continuing): ${msg}`);
      await store.appendEvent(projectId, {
        type: "chapter_critique",
        chapterNumber: payload.chapterNumber,
        verdict: "pass",
        error: msg,
      });
    }

    if (payload.isFinalChapter) {
      return this.completeProject(projectId, writerModel);
    }
    if (nextAfterChapter == null) {
      return this.completeProject(projectId, writerModel);
    }
    return this.enqueueWriteOrComplete(projectId, writerModel, nextAfterChapter);
  }

  async reviseBatch(
    projectId: string,
    payload: ReviseBatchPayload
  ): Promise<"queued" | "complete"> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    await store.assertNotCancelled(projectId);
    await store.updateStatus(projectId, "writing");

    try {
      await reviseAgent.reviseBatch(projectId, payload);
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[folio] revise_batch failed (continuing): ${msg}`);
      await store.appendEvent(projectId, {
        type: "batch_revised",
        batchNumber: payload.batchNumber,
        chapterNumber: payload.chapterNumber,
        error: msg,
      });
    }

    const attempt = payload.revisionAttempt ?? 1;
    await store.enqueueJob(projectId, "verify_revision", {
      force: true,
      dedupeKey: JobKeys.verifyRevision(
        payload.chapterNumber,
        payload.batchNumber,
        attempt
      ),
      payload: {
        batchNumber: payload.batchNumber,
        chapterNumber: payload.chapterNumber,
        issues: payload.issues,
        beatsMissed: payload.beatsMissed,
        isFinalChapter: payload.isFinalChapter,
        revisionKey: payload.revisionKey,
        revisionAttempt: attempt,
      } satisfies VerifyRevisionPayload,
    });
    return "queued";
  }

  async verifyRevision(
    projectId: string,
    payload: VerifyRevisionPayload
  ): Promise<"queued" | "complete"> {
    const project = await store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const writerModel = getModelForProject(project, "writer");

    await store.assertNotCancelled(projectId);
    await store.updateStatus(projectId, "writing");

    let verification: Awaited<
      ReturnType<typeof revisionVerifierAgent.verify>
    > | null = null;
    try {
      verification = await revisionVerifierAgent.verify(projectId, payload);
    } catch (err) {
      if (isGenerationCancelled(err)) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[folio] verify_revision failed (continuing): ${msg}`);
      await store.appendEvent(projectId, {
        type: "revision_verified",
        batchNumber: payload.batchNumber,
        chapterNumber: payload.chapterNumber,
        verdict: "warning",
        error: msg,
      });
    }

    // A confirmed-unfixed batch used to ship as-is. Give it exactly one more
    // attempt, targeting whatever the verifier says is still wrong.
    const attempt = payload.revisionAttempt ?? 1;
    if (verification && !verification.fixed && attempt < MAX_REVISION_ATTEMPTS) {
      const nextAttempt = attempt + 1;
      const remaining = verification.remainingIssues.length
        ? verification.remainingIssues.map((description) => ({
            description,
            severity: "high" as const,
            batchNumber: payload.batchNumber,
          }))
        : payload.issues;

      await store.enqueueJob(projectId, "revise_batch", {
        force: true,
        dedupeKey: JobKeys.revise(
          payload.chapterNumber,
          payload.batchNumber,
          nextAttempt
        ),
        payload: {
          batchNumber: payload.batchNumber,
          chapterNumber: payload.chapterNumber,
          issues: remaining,
          beatsMissed: payload.beatsMissed,
          isFinalChapter: payload.isFinalChapter,
          revisionKey: revisionKeyFor(
            payload.chapterNumber,
            payload.batchNumber,
            nextAttempt
          ),
          revisionAttempt: nextAttempt,
        } satisfies ReviseBatchPayload,
      });
      return "queued";
    }

    if (payload.isFinalChapter) {
      return this.completeProject(projectId, writerModel);
    }
    const nextAfterChapter = getNextBatchAfterQualityGate(
      project.batches,
      payload.chapterNumber
    );
    if (nextAfterChapter == null) {
      return this.completeProject(projectId, writerModel);
    }
    return this.enqueueWriteOrComplete(projectId, writerModel, nextAfterChapter);
  }

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
    // Skip audit in composeBook convenience path — go straight to write
    await this.writeBook(projectId);
  }
}

export const bookComposer = new BookComposer();
