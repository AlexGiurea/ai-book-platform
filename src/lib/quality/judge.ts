/**
 * Whole-manuscript judge — the subjective half of the quality score.
 *
 * One call, reading the entire book against a fixed rubric. This is the only
 * thing in Folio that ever evaluates a finished manuscript as a whole rather
 * than a chapter at a time. The rubric is deliberately frozen: changing the
 * wording changes the scores, and the whole point is comparability across runs.
 */

import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIClient } from "@/lib/agent/openai-client";
import { extractResponseUsage } from "@/lib/agent/openai-client";
import type { Batch, StoryBible } from "@/lib/agent/types";

/** Bump when the rubric text changes — scores are only comparable within a version. */
export const RUBRIC_VERSION = "1.0.0";

const JUDGE_MAX_OUTPUT_TOKENS = 6000;

const DimensionSchema = z.object({
  score: z.number().describe("0-100."),
  note: z.string().describe("One or two sentences justifying the score, citing specifics."),
});

export const BookJudgementSchema = z.object({
  prose: DimensionSchema.describe("Sentence-level craft: rhythm, imagery, economy, dialogue that sounds like distinct people."),
  continuity: DimensionSchema.describe("Contradictions, timeline coherence, characters behaving consistently with what came before."),
  structure: DimensionSchema.describe("Pacing and shape. Does the midpoint turn, does the climax arrive earned rather than announced."),
  voice: DimensionSchema.describe("Consistency and distinctiveness of narration across the whole book. Penalize drift between early and late chapters."),
  payoff: DimensionSchema.describe("Setups that resolve. Threads planted and paid off, promises the opening makes and the ending keeps."),
  overall: z.number().describe("0-100 holistic score. Not an average — weight continuity and payoff most heavily for a long novel."),
  verdict: z.string().describe("Two or three sentences: what this book does well and what most limits it."),
  issues: z
    .array(
      z.object({
        severity: z.enum(["minor", "moderate", "severe"]),
        chapter: z.number().describe("Chapter number, or 0 if book-wide."),
        description: z.string().describe("The specific problem, quoting or naming the detail."),
      })
    )
    .describe("Concrete defects, most severe first. Up to 20."),
});

export type BookJudgement = z.infer<typeof BookJudgementSchema>;

export interface JudgeResult {
  judgement: BookJudgement;
  model: string;
  rubricVersion: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    cacheWriteTokens: number;
    outputTokens: number;
  };
  durationMs: number;
}

function buildJudgeSystemPrompt(): string {
  return `You are a senior developmental editor at a literary imprint, assessing a complete manuscript.

You will be given a book's plan followed by its full text. Read the whole thing before scoring.

# HOW TO SCORE

Use the full 0-100 range and calibrate against published fiction, not against other AI output:
- 90+ — indistinguishable from a well-edited published novel.
- 75-89 — competent and readable; a working editor would acquire it and ask for revisions.
- 60-74 — clearly machine-assembled. Individual sentences work; the book does not cohere.
- 40-59 — serious structural failure: dropped threads, contradictions, an unearned ending.
- Below 40 — not a book.

Most manuscripts you see will land in the 60s or 70s. Do not inflate. A score above 85 must be
justified by specifics you can point to.

# WHAT MATTERS MOST

This is a long novel, so weight continuity and payoff above sentence polish. A beautifully written
book that forgets its own premise scores worse than a plainer one that holds together.

Look especially for the failure modes of serial generation:
- Voice drifting between the opening chapters and the closing ones.
- A character established early behaving inconsistently later, or quietly vanishing.
- Imagery, metaphors, or distinctive phrasings reused as if fresh.
- Threads raised with weight and never resolved.
- A climax that arrives because the page count demanded it rather than because the story built to it.

# ISSUES

Report concrete defects only. "The pacing could be tighter" is useless; "Chapter 9 resolves the
mine collapse offstage, so Kell's decision in Chapter 4 never costs him anything" is useful. Cite
chapter numbers. Do not invent problems to fill the list — an empty list is a valid answer.`;
}

function buildJudgeUserPrompt(params: {
  bible: StoryBible | undefined;
  batches: Batch[];
  totalWords: number;
}): string {
  const { bible, batches, totalWords } = params;

  const planBlock = bible
    ? `## Title
${bible.title}

## Logline
${bible.logline}

## Synopsis
${bible.synopsis}

## Premise
${bible.premise}

## Structural intent
- Acts: ${bible.structure.actBreakdown}
- Inciting: ${bible.structure.inciting}
- Midpoint: ${bible.structure.midpoint}
- Climax: ${bible.structure.climax}
- Resolution: ${bible.structure.resolution}

## Characters as planned
${bible.characters.map((c) => `- ${c.name} (${c.role}). Arc: ${c.arc}`).join("\n")}

## Themes
${bible.themes.map((t) => `- ${t}`).join("\n")}`
    : "(no plan available for this manuscript)";

  const ordered = [...batches].sort((a, b) => a.batchNumber - b.batchNumber);
  let lastChapter: number | undefined;
  const manuscript = ordered
    .map((b) => {
      const parts: string[] = [];
      if (b.chapterNumber != null && b.chapterNumber !== lastChapter) {
        lastChapter = b.chapterNumber;
        parts.push(`\n\n## Chapter ${b.chapterNumber}${b.chapterTitle ? ` — ${b.chapterTitle}` : ""}`);
      }
      parts.push(b.prose);
      return parts.join("\n\n");
    })
    .join("\n\n");

  return `# THE PLAN THE BOOK WAS WRITTEN FROM

${planBlock}

# THE FINISHED MANUSCRIPT (${totalWords.toLocaleString()} words)
${manuscript}

# YOUR TASK

Score this manuscript against the rubric and return the structured judgement. Read the whole book
before you score any dimension.`;
}

export async function judgeManuscript(params: {
  bible: StoryBible | undefined;
  batches: Batch[];
  totalWords: number;
  model: string;
  signal?: AbortSignal;
}): Promise<JudgeResult> {
  const client = getOpenAIClient();
  const started = Date.now();

  const response = await client.responses.parse(
    {
      model: params.model,
      instructions: buildJudgeSystemPrompt(),
      input: buildJudgeUserPrompt(params),
      max_output_tokens: JUDGE_MAX_OUTPUT_TOKENS,
      text: { format: zodTextFormat(BookJudgementSchema, "book_judgement") },
    },
    params.signal ? { signal: params.signal } : undefined
  );

  const judgement = response.output_parsed;
  if (!judgement) {
    throw new Error("Judge returned no parsed output");
  }

  const usage = extractResponseUsage(response);
  return {
    judgement,
    model: params.model,
    rubricVersion: RUBRIC_VERSION,
    usage: {
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      outputTokens: usage.outputTokens,
    },
    durationMs: Date.now() - started,
  };
}
