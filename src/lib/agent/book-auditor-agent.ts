/**
 * The whole-book audit — the only stage that reads a finished manuscript entire.
 *
 * Everything upstream is chapter-local: the critic sees one chapter, the verifier
 * one batch. Nothing ever asked whether the *book* works, so a thread planted in
 * act one and never paid off would ship without anything noticing.
 *
 * The pass has two halves. The free half runs the deterministic checks already
 * written for the quality harness — thread resolution against the ledger, planned
 * characters who never reach the page — and costs nothing. Those findings are fed
 * to the model half as established fact rather than left for it to notice, which
 * is both cheaper and more reliable than hoping it spots them.
 *
 * The model half reads the manuscript at roughly $0.23: the manuscript is a
 * cached prefix by this point, so the read is mostly discounted and only the
 * verdict is paid for at output rates.
 */

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
import { BookAuditOutputSchema, type BookAuditOutputParsed } from "./schemas";
import {
  buildBookAuditorSystemPrompt,
  buildBookAuditorUserPrompt,
} from "./prompts";
import { stripEmDashes } from "./sanitize";
import { MAX_BOOK_REPAIRS } from "./job-keys";
import {
  checkCharacterPresence,
  checkThreadResolution,
} from "@/lib/quality/manuscript-checks";
import type { Batch, BookProject, BookRepairIssue } from "./types";

const BOOK_AUDITOR_MAX_OUTPUT_TOKENS = 4000;

export interface BookAuditResult {
  audit: BookAuditOutputParsed;
  /** Capped, batch-validated repairs ready to enqueue. */
  repairs: BookRepairIssue[];
  mechanicalFindings: string[];
  unresolvedThreadCount: number;
  model: string;
  durationMs: number;
}

/** Assemble the manuscript with chapter headings, matching the writer's view. */
export function renderManuscript(batches: Batch[]): string {
  const ordered = [...batches].sort((a, b) => a.batchNumber - b.batchNumber);
  let chapter: number | undefined;
  return ordered
    .map((b) => {
      const parts: string[] = [];
      if (b.chapterNumber != null && b.chapterNumber !== chapter) {
        chapter = b.chapterNumber;
        parts.push(
          `## Chapter ${b.chapterNumber}${b.chapterTitle ? ` — "${b.chapterTitle}"` : ""}`
        );
      }
      parts.push(`### §${b.batchNumber}`);
      parts.push(b.prose);
      return parts.join("\n\n");
    })
    .join("\n\n");
}

/**
 * Run the free deterministic checks and phrase their findings for the model.
 * Returns the findings plus the unresolved-thread count for telemetry.
 */
export function collectMechanicalFindings(project: BookProject): {
  findings: string[];
  unresolvedThreadCount: number;
} {
  const input = {
    targetWords: project.targetWords,
    totalWords: project.totalWords,
    bible: project.bible,
    storyState: project.storyState,
    batches: project.batches,
  };

  const threads = checkThreadResolution(input);
  const characters = checkCharacterPresence(input);

  const findings: string[] = [];
  for (const result of [threads, characters]) {
    if (result.status === "pass" || result.status === "skipped") continue;
    findings.push(result.detail);
    for (const item of result.items ?? []) findings.push(`  ${item}`);
  }

  // `items` holds one line per broken thread; the check's own count is authoritative.
  const unresolvedThreadCount =
    threads.status === "skipped" ? 0 : (threads.items?.length ?? 0);

  return { findings, unresolvedThreadCount };
}

/**
 * Keep only issues pointing at batches that exist, drop duplicates targeting the
 * same batch (one rewrite can only be applied once), and cap the list.
 */
export function selectRepairs(
  issues: BookAuditOutputParsed["issues"],
  validBatchNumbers: number[],
  cap: number = MAX_BOOK_REPAIRS
): BookRepairIssue[] {
  const valid = new Set(validBatchNumbers);
  const seenBatches = new Set<number>();
  const repairs: BookRepairIssue[] = [];

  // The model is told to rank most severe first; keep that order, but put every
  // severe issue ahead of every moderate one in case it did not.
  const ranked = [...issues].sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "severe" ? -1 : 1;
  });

  for (const issue of ranked) {
    if (repairs.length >= cap) break;
    if (!valid.has(issue.batchNumber)) continue;
    if (seenBatches.has(issue.batchNumber)) continue;
    seenBatches.add(issue.batchNumber);
    repairs.push({
      batchNumber: issue.batchNumber,
      severity: issue.severity,
      description: `${stripEmDashes(issue.description)} FIX: ${stripEmDashes(issue.fix)}`,
    });
  }

  return repairs;
}

export class BookAuditorAgent {
  async auditBook(projectId: string): Promise<BookAuditResult> {
    const project = await store.getProject(projectId);
    if (!project?.bible) throw new Error(`Project ${projectId} missing bible`);
    if (!project.batches.length) {
      throw new Error(`Project ${projectId} has no manuscript to audit`);
    }

    const { findings, unresolvedThreadCount } = collectMechanicalFindings(project);
    const validBatchNumbers = project.batches
      .map((b) => b.batchNumber)
      .sort((a, b) => a - b);

    const client = getOpenAIClient();
    const model = getModelForProject(project, "book_auditor");
    const config = getProjectPipelineConfig(project);

    const instructions = buildBookAuditorSystemPrompt();
    const input = buildBookAuditorUserPrompt({
      bible: project.bible,
      manuscript: renderManuscript(project.batches),
      totalWords: project.totalWords,
      validBatchNumbers,
      mechanicalFindings: findings,
    });

    await store.assertNotCancelled(projectId);
    const genSignal = store.getGenerationSignal(projectId);
    const started = Date.now();
    const extras = buildResponsesCallExtras({
      projectId,
      role: "book_auditor",
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
          max_output_tokens: BOOK_AUDITOR_MAX_OUTPUT_TOKENS,
          ...extras,
          text: { format: zodTextFormat(BookAuditOutputSchema, "book_audit") },
        },
        genSignal ? { signal: genSignal } : undefined
      );
    } catch (err) {
      const c = toGenerationCancelled(err);
      if (c) throw c;
      throw err;
    }
    const durationMs = Date.now() - started;

    await store.recordLlmUsage(projectId, "book_auditor", model, {
      ...extractResponseUsage(response),
      operation: "book_audit",
      durationMs,
    });

    const parsed = response.output_parsed;
    if (!parsed) throw new Error("Book auditor returned no parsed output");

    const audit: BookAuditOutputParsed = {
      verdict: parsed.verdict,
      issues: parsed.issues.map((i) => ({
        batchNumber: i.batchNumber,
        severity: i.severity,
        description: stripEmDashes(i.description),
        fix: stripEmDashes(i.fix),
      })),
      unresolvedThreads: parsed.unresolvedThreads.map(stripEmDashes),
      notes: parsed.notes ? stripEmDashes(parsed.notes) : null,
    };

    const repairs =
      audit.verdict === "repair"
        ? selectRepairs(audit.issues, validBatchNumbers)
        : [];

    return {
      audit,
      repairs,
      mechanicalFindings: findings,
      unresolvedThreadCount,
      model,
      durationMs,
    };
  }
}

export const bookAuditorAgent = new BookAuditorAgent();
