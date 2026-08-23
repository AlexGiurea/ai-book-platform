import { writerAgent, type BatchWriteResult } from "./writer-agent";
import { store } from "./context-store";
import { revisionKeyFor } from "./job-keys";
import type { ReviseBatchPayload } from "./types";

export class ReviseAgent {
  async reviseBatch(
    projectId: string,
    payload: ReviseBatchPayload
  ): Promise<BatchWriteResult> {
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);

    const blueprint = project.bible.batches.find((b) => b.number === payload.batchNumber);
    if (!blueprint) {
      throw new Error(`Blueprint for batch ${payload.batchNumber} not found`);
    }

    const revisionKey =
      payload.revisionKey ??
      revisionKeyFor(payload.chapterNumber, payload.batchNumber);

    const issueLines = payload.issues
      .map(
        (i) =>
          `- [batch ${i.batchNumber}] (${i.severity}) ${i.description}`
      )
      .join("\n");
    const missed =
      payload.beatsMissed.length > 0
        ? `\nMissed chapter beats to restore:\n${payload.beatsMissed.map((b) => `- ${b}`).join("\n")}`
        : "";
    const laterOutcomeLines = project.batches
      .filter(
        (batch) =>
          batch.chapterNumber === payload.chapterNumber &&
          batch.batchNumber > payload.batchNumber &&
          !!batch.chapterSummary
      )
      .sort((a, b) => a.batchNumber - b.batchNumber)
      .slice(0, 3)
      .map(
        (batch) =>
          `- Batch ${batch.batchNumber}: ${batch.chapterSummary!.slice(0, 400)}`
      );
    const laterOutcomeConstraints = laterOutcomeLines.length
      ? `\n\nIMMUTABLE LATER OUTCOMES IN THIS ALREADY-WRITTEN CHAPTER (summaries only):\n${laterOutcomeLines.join("\n")}\nYour revision must not contradict, erase, or make these outcomes impossible. Do not copy or anticipate their prose.`
      : "";

    const critiqueFixes = `You are REVISING batch ${payload.batchNumber}. Fix these critique findings without breaking surrounding continuity:\n${issueLines}${missed}${laterOutcomeConstraints}\nPreserve voice, tense, POV, and already-established canon. Use exact thread ids from the thread ledger / story state when updating stateDelta.`;

    return writerAgent.writeBatch(projectId, blueprint, {
      critiqueFixes,
      replaceBatchNumber: payload.batchNumber,
      revisionKey,
    });
  }
}

export const reviseAgent = new ReviseAgent();
