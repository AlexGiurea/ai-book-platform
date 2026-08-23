import { zodTextFormat } from "openai/helpers/zod";
import {
  buildResponsesCallExtras,
  extractResponseUsage,
  getModelForProject,
  getOpenAIClient,
  getProjectPipelineConfig,
} from "./openai-client";
import { store } from "./context-store";
import { toGenerationCancelled } from "./generation-errors";
import {
  PlanRepairOutputSchema,
  type PlanRepairOutputParsed,
} from "./schemas";
import { buildPlanRepairSystemPrompt, buildPlanRepairUserPrompt } from "./prompts";
import { stripEmDashes } from "./sanitize";
import type {
  PlanRepairPayload,
  StoryBible,
  ThreadLedgerEntry,
} from "./types";

const REPAIR_MAX_OUTPUT_TOKENS = 8000;

export function validateBibleInvariants(bible: StoryBible): string[] {
  const errors: string[] = [];
  if (!bible.chapters.length) errors.push("No chapters");
  if (!bible.batches.length) errors.push("No batches");
  if (!Number.isInteger(bible.totalBatches) || bible.totalBatches < 1) {
    errors.push("totalBatches must be a positive integer");
  }
  if (bible.batches.length !== bible.totalBatches) {
    errors.push(
      `Batch count ${bible.batches.length} does not match totalBatches ${bible.totalBatches}`
    );
  }
  const nums = bible.batches.map((b) => b.number).sort((a, b) => a - b);
  for (let i = 0; i < bible.totalBatches; i++) {
    if (nums[i] !== i + 1) {
      errors.push(`Batch numbering gap/overlap at expected batch ${i + 1}`);
      break;
    }
  }

  const chapters = bible.chapters.slice().sort((a, b) => a.number - b.number);
  let expectedStart = 1;
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (ch.number !== i + 1) {
      errors.push(`Chapter numbering gap/overlap at expected chapter ${i + 1}`);
    }
    if (
      !Number.isInteger(ch.batchStart) ||
      !Number.isInteger(ch.batchEnd) ||
      ch.batchStart < 1 ||
      ch.batchEnd > bible.totalBatches ||
      ch.batchStart > ch.batchEnd
    ) {
      errors.push(`Chapter ${ch.number} has invalid batch range`);
    }
    if (ch.batchStart !== expectedStart) {
      errors.push(
        `Chapter coverage gap/overlap: expected chapter ${ch.number} to start at batch ${expectedStart}`
      );
    }
    expectedStart = ch.batchEnd + 1;
  }
  if (chapters.length && expectedStart !== bible.totalBatches + 1) {
    errors.push(
      `Chapter coverage ends at batch ${expectedStart - 1}, expected ${bible.totalBatches}`
    );
  }

  const chapterByNumber = new Map(chapters.map((ch) => [ch.number, ch]));
  for (const batch of bible.batches) {
    const chapter = chapterByNumber.get(batch.chapterNumber);
    if (!chapter) {
      errors.push(
        `Batch ${batch.number} references missing chapter ${batch.chapterNumber}`
      );
    } else if (
      batch.number < chapter.batchStart ||
      batch.number > chapter.batchEnd
    ) {
      errors.push(
        `Batch ${batch.number} falls outside chapter ${batch.chapterNumber} range`
      );
    }
  }

  const ledger = bible.threadLedger ?? [];
  const ids = new Set<string>();
  for (const t of ledger) {
    const id = t.id.trim();
    if (!id) errors.push("Thread id must be non-empty");
    if (ids.has(id)) errors.push(`Duplicate thread id ${id}`);
    ids.add(id);
    if (
      !Number.isInteger(t.plantBatch) ||
      !Number.isInteger(t.resolveByBatch) ||
      t.plantBatch < 1 ||
      t.resolveByBatch < t.plantBatch ||
      t.resolveByBatch > bible.totalBatches
    ) {
      errors.push(`Thread ${id || "(empty)"} has invalid plant/resolve range`);
    }
  }
  return errors;
}

export function applyPlanRepairPatch(
  original: StoryBible,
  parsed: PlanRepairOutputParsed
): { bible: StoryBible; accepted: boolean; errors: string[] } {
  const bible: StoryBible = {
    ...original,
    chapters: original.chapters.map((chapter) => ({ ...chapter })),
    batches: original.batches.map((batch) => ({
      ...batch,
      scenes: [...batch.scenes],
      charactersPresent: [...batch.charactersPresent],
      continuityFlags: [...batch.continuityFlags],
    })),
    threadLedger: (original.threadLedger ?? []).map((thread) => ({ ...thread })),
  };

  for (const ch of parsed.chapterReplacements ?? []) {
    const idx = bible.chapters.findIndex((c) => c.number === ch.number);
    const cleaned = {
      ...ch,
      title: stripEmDashes(ch.title),
      summary: stripEmDashes(ch.summary),
      arcPurpose: stripEmDashes(ch.arcPurpose),
      openingHook: stripEmDashes(ch.openingHook),
      closingBeat: stripEmDashes(ch.closingBeat),
    };
    if (idx >= 0) bible.chapters[idx] = cleaned;
    else bible.chapters.push(cleaned);
  }
  bible.chapters.sort((a, b) => a.number - b.number);

  for (const batch of parsed.batchReplacements ?? []) {
    const idx = bible.batches.findIndex((item) => item.number === batch.number);
    const cleaned = {
      ...batch,
      chapterTitle: stripEmDashes(batch.chapterTitle),
      purpose: stripEmDashes(batch.purpose),
      settingLocation: stripEmDashes(batch.settingLocation),
      toneNote: stripEmDashes(batch.toneNote),
      scenes: batch.scenes.map(stripEmDashes),
      continuityFlags: batch.continuityFlags.map(stripEmDashes),
    };
    if (idx >= 0) bible.batches[idx] = cleaned;
    else bible.batches.push(cleaned);
  }
  bible.batches.sort((a, b) => a.number - b.number);

  if (parsed.threadLedgerReplacements?.length) {
    const map = new Map<string, ThreadLedgerEntry>(
      (bible.threadLedger ?? []).map((thread) => [thread.id, thread])
    );
    for (const thread of parsed.threadLedgerReplacements) {
      map.set(thread.id, {
        id: stripEmDashes(thread.id),
        description: stripEmDashes(thread.description),
        plantBatch: thread.plantBatch,
        resolveByBatch: thread.resolveByBatch,
      });
    }
    bible.threadLedger = Array.from(map.values());
  }

  const errors = validateBibleInvariants(bible);
  return errors.length
    ? { bible: original, accepted: false, errors }
    : { bible, accepted: true, errors: [] };
}

export class PlanRepairAgent {
  async repairPlan(
    projectId: string,
    payload: PlanRepairPayload
  ): Promise<StoryBible> {
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);

    const client = getOpenAIClient();
    const model = getModelForProject(project, "planner"); // Sol for repair
    const config = getProjectPipelineConfig(project);
    const instructions = buildPlanRepairSystemPrompt();
    const input = buildPlanRepairUserPrompt({
      bible: project.bible,
      issues: payload.issues,
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const started = Date.now();
    const extras = buildResponsesCallExtras({
      projectId,
      role: "planner",
      model,
      config,
    });

    let response;
    try {
      response = await client.responses.parse(
        {
          model,
          instructions,
          input,
          max_output_tokens: REPAIR_MAX_OUTPUT_TOKENS,
          ...extras,
          text: {
            format: zodTextFormat(PlanRepairOutputSchema, "plan_repair"),
          },
        },
        genSignal ? { signal: genSignal } : undefined
      );
    } catch (err) {
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw err;
    }
    const durationMs = Date.now() - started;

    await store.recordLlmUsage(projectId, "planner", model, {
      ...extractResponseUsage(response),
      operation: "plan_repair",
      durationMs,
    });

    const parsed = response.output_parsed;
    if (!parsed) throw new Error("Plan repair returned no parsed output");

    const patch = applyPlanRepairPatch(project.bible, parsed);
    if (!patch.accepted) {
      console.warn(
        `[folio] plan_repair rejected: ${patch.errors.join("; ")}`
      );
    }

    if (patch.accepted) {
      await store.setBible(projectId, patch.bible);
    }
    await store.appendEvent(projectId, {
      type: "plan_repaired",
      verdict: patch.accepted ? "pass" : "warning",
      durationMs,
      model,
      issueCount: patch.errors.length,
      error: patch.errors.length
        ? `Rejected invalid repair; original plan preserved. ${patch.errors.join("; ")}`
        : undefined,
    });

    return patch.bible;
  }
}

export const planRepairAgent = new PlanRepairAgent();
