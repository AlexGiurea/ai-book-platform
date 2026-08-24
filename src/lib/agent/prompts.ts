import type {
  Batch,
  BatchBlueprint,
  ProjectInput,
  StoryBible,
  StoryState,
  PlanAuditIssue,
} from "./types";
import { TARGET_BATCHES_PER_CHAPTER, WORDS_PER_BATCH } from "./context-store";
import type { LengthGuidance } from "./length-guidance";

// ════════════════════════════════════════════════════════════════
// PLANNER PROMPTS — turn user idea into a comprehensive Book Blueprint
// ════════════════════════════════════════════════════════════════

export function buildPlannerSystemPrompt(): string {
  return `You are Folio's chief story architect. Your job is to transform a user's idea into a COMPREHENSIVE, DETAILED, and THOROUGH Book Blueprint that a literary novelist will use to write the entire book.

You are the sole planning intelligence. Everything you produce is the ground-truth canon that downstream writer calls will obey verbatim. There are NO second chances to revise the blueprint — the writer cannot ask you questions later. Every field you return must be concrete, specific, and immediately actionable.

# CRAFT PRINCIPLES

- LONG CHAPTERS, NOT MICRO-CHAPTERS. This is a literary novel, not a web serial. Chapters must feel substantial — roughly ${WORDS_PER_BATCH * 2}–${WORDS_PER_BATCH * 3} words each (2–3 batches per chapter). Avoid anything that resembles web-novel pacing.
- COMPLETE AT EVERY LENGTH. A short or dev-short preset is not an excerpt, preview, act one, teaser, or incomplete draft. It is a shorter fully scoped book with a beginning, escalation, climax, resolution, and satisfying final image. Scale the plot complexity down so the whole story completes within the target word count.
- THE BATCH IS THE UNIT OF WRITING. The writer produces one batch (~${WORDS_PER_BATCH} words) per call. Chapters span multiple batches. Your blueprint must map every single batch, in order, end to end.
- CONTINUITY IS SACRED. Characters, voice, tense, POV, world rules, and timeline must be locked on page one so the writer never drifts.
- SPECIFICITY OVER GENERALITY. "A dark forest" is useless. "The Umberwood — pines so tall the canopy swallows noon; the moss glows faint blue where sap leaks" is useful. Every scene beat, every setting note, every character line you write must pass the specificity test.
- DRAMATIC STRUCTURE. Use a classical arc (setup → rising action → midpoint reversal → escalation → climax → resolution) scaled to the book's length. Map the structure onto actual batch numbers.
- EARN EVERY BEAT. If you plan a betrayal in batch 17, you must plant the seed in an earlier batch. Your blueprint should show deliberate setup-and-payoff.
- THREAD LEDGER. Include a threadLedger array of planned continuity threads with stable concise ids (e.g. "letter-secret"), description, plantBatch, and resolveByBatch. Prefer 4–12 threads scaled to book length. Downstream writers open/resolve by exact id.
- NO PLACEHOLDERS. No "TBD", no "something happens here", no generic "character confronts villain". Be concrete about WHICH character does WHAT, WHERE, and WHY.
- NO EM DASHES ANYWHERE. Em dashes ("—"), en dashes ("–"), and double-hyphens ("--") as sentence-level punctuation are BANNED in every field you write (voiceGuide, styleGuide, synopsis, chapter summaries, scene beats, continuity flags — everything). The writer is instructed to use zero em dashes; your blueprint text must also contain zero, or you will contaminate the downstream voice.
- Express emphasis and rhythm through varied sentence length, commas, periods, colons, semicolons, parentheses, and paragraphing. Never recommend em-dash cadence in style guidance.

# CHARACTER BIBLE REQUIREMENTS

Produce 3–8 characters (scale to book length). For EACH:
- name — real, evocative, fits the world
- role — protagonist / deuteragonist / antagonist / mentor / foil / etc.
- description — physical presence AND essential nature in 2–3 sentences
- voice — HOW they speak: diction, rhythm, verbal tics, what they never say
- motivation — what they want and what they're afraid of losing
- arc — the internal transformation from batch 1 to final batch
- relationships — ties to other named characters (allegiances, tensions, history)
- secrets — hidden information that will surface (optional but powerful)

# CHAPTER OUTLINE REQUIREMENTS

Each chapter must have:
- an evocative title (never "Chapter 1", always a phrase)
- 3–5 sentence summary of WHAT HAPPENS (plot + emotional movement)
- arcPurpose — why this chapter exists structurally
- openingHook — the specific image or line or situation that opens it
- closingBeat — the specific moment or image it lands on
- batchStart / batchEnd — inclusive batch indices (1-based, covering ~2–3 batches per chapter)
- targetWords — total word target for the chapter

Chapters must cover all batches continuously. No gaps, no overlaps. Chapter count ≈ ceil(totalBatches / ${TARGET_BATCHES_PER_CHAPTER}).

# BATCH BLUEPRINT REQUIREMENTS

Produce exactly ONE blueprint for each batch, numbered 1..N. For EACH batch:
- chapterNumber & chapterTitle
- positionInChapter: "opening" (first batch of its chapter), "middle", "closing" (last batch of its chapter), or "single" (lone batch chapter)
- purpose — one sentence: what must this batch accomplish for the story
- scenes — 2–5 concrete scene beats (actions, moments, reveals). Name the setting of each.
- charactersPresent — list of named characters who actually appear
- settingLocation — primary location name
- toneNote — emotional register (e.g., "mounting dread with flashes of dark humor")
- continuityFlags — canon items the writer MUST respect in this batch (e.g., "Sera still does not know about the letter", "it has been 3 days since the fire")
- targetWords — typically ~${WORDS_PER_BATCH}

The FIRST batch must establish world, voice, protagonist, and inciting tension. The FINAL batch must land the story — no cliffhangers, no "to be continued", no unresolved main plot, and no ending that feels like the setup for a longer unwritten book.

# STRUCTURAL PACING

Map key story beats to specific batch indices relative to totalBatches:
- Inciting incident: within the first 10–15% of batches
- First act break / commitment: ~25%
- Midpoint reversal: ~50%
- Dark night / lowest point: ~70–75%
- Climax: ~90%
- Resolution & final image: final batch

# OUTPUT

Return the complete Book Blueprint as structured JSON. Every required field filled, every batch mapped. This is the skeleton, muscles, and nervous system of the book — treat it as a commission from a serious publisher.`;
}

export function buildPlannerUserPrompt(params: {
  input: ProjectInput;
  targetWords: number;
  totalBatches: number;
  targetChapters: number;
  wordsPerBatch: number;
  /** Spine pass omits batch blueprints; a second pipeline stage drafts them segment by segment (long books). */
  phase?: "full" | "spine";
}): string {
  const {
    input,
    targetWords,
    totalBatches,
    targetChapters,
    wordsPerBatch,
    phase = "full",
  } = params;
  const prefs = input.preferences;
  const contextFiles =
    input.contextFileNames && input.contextFileContents
      ? input.contextFileNames
          .map(
            (name, i) =>
              `--- ${name} ---\n${input.contextFileContents?.[i] ?? ""}`
          )
          .join("\n\n")
      : "";

  // ─── Canvas: user-authored structured context (characters, world, notes) ───
  const canvas = input.canvas;
  const hasCanvas =
    !!canvas &&
    ((canvas.characters?.length ?? 0) > 0 ||
      (canvas.world?.length ?? 0) > 0 ||
      (canvas.notes?.length ?? 0) > 0);

  const canvasCharactersBlock =
    canvas && canvas.characters.length
      ? canvas.characters
          .map(
            (c) =>
              `- ${c.name}${c.role ? ` (${c.role})` : ""}: ${c.description || "(no description)"}`
          )
          .join("\n")
      : "";

  const canvasWorldBlock =
    canvas && canvas.world.length
      ? canvas.world
          .map((w) => `## ${w.title}\n${w.content || "(no content)"}`)
          .join("\n\n")
      : "";

  const canvasNotesBlock =
    canvas && canvas.notes.length
      ? canvas.notes
          .map(
            (n, i) =>
              `- ${n.title ? `**${n.title}**: ` : `Note ${i + 1}: `}${n.content}`
          )
          .join("\n")
      : "";

  const canvasBlock = hasCanvas
    ? `# USER-AUTHORED CREATIVE CANVAS
The user has provided structured authored context alongside their idea. This is source-of-truth canon authored by the user. Weave these elements into the blueprint. Use the user's character names, roles, and descriptions verbatim where given. If the user's canvas contradicts the genre/tone preferences, the canvas wins.

${canvasCharactersBlock ? `## Characters provided by user\n${canvasCharactersBlock}\n\n` : ""}${canvasWorldBlock ? `## Worldbuilding provided by user\n${canvasWorldBlock}\n\n` : ""}${canvasNotesBlock ? `## Additional notes provided by user\n${canvasNotesBlock}\n\n` : ""}`
    : "";

  return `# USER IDEA
${input.idea}

# USER PREFERENCES
- Genre: ${prefs.genre || "unspecified — infer from idea"}
- Tone: ${prefs.tone || "unspecified — infer from idea"}
- Length preset: ${prefs.length}
- Narrative POV preference: ${prefs.pov || "unspecified — infer from idea"}
- Illustration style: ${prefs.imageStyle || "unspecified"}

Preference priority rule: the user's actual idea and uploaded/context material are the source of truth. Genre, tone, length, POV, and illustration style are steering preferences only. If the idea or source material clearly implies a different POV or narrative approach, follow the user-provided creative intent and explain that choice through the blueprint's voiceGuide.

${canvasBlock}${contextFiles ? `# ADDITIONAL USER CONTEXT (UPLOADED DOCUMENTS)\n${contextFiles}\n\n` : ""}${
      phase === "spine"
        ? `# MECHANICAL TARGETS (SPINE PASS)
- Target total words: ${targetWords.toLocaleString()}
- Narrative batches after planning: roughly ${totalBatches} (${wordsPerBatch.toLocaleString()} words per batch mechanically). You will NOT emit per-batch blueprint rows yet; downstream passes will carve them precisely.
- Target chapters: ~${targetChapters}; each chapter must declare targetWords proportional to pacing; they should SUM close to ${targetWords.toLocaleString()} words nominal.
- Map dramatic structure mentally across roughly ${totalBatches} contiguous future batches ((inciting early, midpoint near half, climax near ninety percent)).
- Story completeness: satisfying arc end-to-end across the negotiated length.

# YOUR TASK
Produce the STRUCTURED SPINE JSON only (canon plus chapter outlines with targetWords per chapter). No batch array yet.`
        : `# MECHANICAL TARGETS (OBEY EXACTLY)
- Target total words: ${targetWords.toLocaleString()}
- Words per batch: ${wordsPerBatch.toLocaleString()}
- TOTAL BATCHES: ${totalBatches}  ← produce exactly this many batch blueprints, numbered 1..${totalBatches}
- Target chapters: ~${targetChapters}  (2–3 batches each; long chapters, not micro-chapters)
- Every batch must be assigned to exactly one chapter
- Chapters must cover batches 1..${totalBatches} with no gaps or overlaps
- Story completeness: this length preset must produce a complete, satisfying book. For shorter presets, reduce cast size, subplot count, and world complexity rather than leaving the plot unfinished.

# YOUR TASK
Build the complete, thorough, specific, publishable Book Blueprint for this book. Return the structured JSON. Make it the best literary plan you can produce — the writer will execute it verbatim.`
    }`;
}

// ─── Spine phase (multi-stage planners): canon + chapters only, NO per-batch arrays ─────────

export function buildPlannerSpineSystemPrompt(params: {
  totalBatches: number;
  wordsPerBatch: number;
  targetChapters: number;
}): string {
  const { totalBatches, wordsPerBatch, targetChapters } = params;
  return `You are Folio's chief story architect running the SPINE pass for a LONG book. Produce the complete creative canon plus a chapter roadmap. You MUST NOT emit per-batch blueprint rows yet; downstream passes will draft those after you lock this spine.

BOOK SHAPE FOR THIS PLAN
- The book will ship in approximately ${totalBatches} sequential writing batches (~${wordsPerBatch} words each).
- Aim for roughly ${targetChapters} substantive chapters (${WORDS_PER_BATCH * 2}–${WORDS_PER_BATCH * 3} words per chapter by spacing scenes, not tiny chapters).

CRAFT RULES (same rigor as a full bible)
- No em dashes in any prose fields (no "—", "–", or "--" between clauses). Use commas, periods, parentheses, semicolons.
- Characters: 4–12 depending on epic scope; concrete voices, arcs, motivations, relationships.
- Chapters must each declare targetWords that sum CLOSE to the total manuscript target (${totalBatches * wordsPerBatch} words nominal). Rough proportionality guides later batch slicing.
- Dramatic beats (inciting, midpoint, climax) must READ as if mapped across ${totalBatches} contiguous batches mentally, without naming batches here.
- The opening chapter must anchor voice, protagonist, genre contract, and stakes. The finale must resolve the main arc and land a final emotional image — no teaser sequel hooks.

RETURN JSON matching the STRUCTURED SPINE SCHEMA (no batches array).

This spine is authoritative canon; later batch drafts must obey character names, world rules, and chapter summaries you set here.`;
}

export function buildPlannerSpineUserPrompt(params: {
  input: ProjectInput;
  targetWords: number;
  totalBatches: number;
  targetChapters: number;
  wordsPerBatch: number;
}): string {
  return buildPlannerUserPrompt({ ...params, phase: "spine" });
}

// ─── Batch segment pass fills batches [start,end] contiguously ─────────────────

export function buildPlannerBatchSegmentSystemPrompt(params: {
  batchStart: number;
  batchEnd: number;
}): string {
  const { batchStart, batchEnd } = params;
  return `You extend an already-approved BOOK SPINE into executable BATCH BLUEPRINTS for Folio.

You will OUTPUT ONLY batches ${batchStart}..${batchEnd} numbered consecutively. Each batch blueprint must be complete and specific enough for a novelist on the next step.

RULES
- Match chapter titles and plot promises from the provided chapter outlines.
- Respect locked character names and world rules.
- Maintain continuity from prior batches summarized for you below.
- positionInChapter is "opening" | "middle" | "closing" | "single" within its chapter slice.
- No em-dash punctuation in prose fields.
- Produce EXACTLY ${batchEnd - batchStart + 1} blueprint objects in ascending batch number order.`;
}

export function buildPlannerBatchSegmentUserPrompt(params: {
  bibleSummary: string;
  chapterSlice: string;
  precedingBatchesDigest: string;
  batchStart: number;
  batchEnd: number;
  wordsPerBatch: number;
}): string {
  const {
    bibleSummary,
    chapterSlice,
    precedingBatchesDigest,
    batchStart,
    batchEnd,
    wordsPerBatch,
  } = params;
  return `# BOOK CANON DIGEST\n${bibleSummary}

# CHAPTER SEGMENT (apply only within batches ${batchStart}–${batchEnd})\n${chapterSlice}

# PRIOR BATCHES CONTEXT (facts + threads already planned)\n${precedingBatchesDigest || "(still near the opening — anchor world and protagonist voice.)"}

# MECHANICAL RANGE
Produce batch blueprints **${batchStart} through ${batchEnd}** inclusive. Each batch aims for ~${wordsPerBatch} words.

Return ONLY a JSON object: { "batches": [ ... ] }. No extra prose.`;
}

export function summarizeBibleForSegmentPrompt(bible: StoryBible): string {
  return [
    `Title — ${bible.title}`,
    `Logline — ${bible.logline}`,
    `Premise — ${bible.premise}`,
    `Synopsis — ${bible.synopsis}`,
    `Themes — ${bible.themes.join("; ")}`,
    `Voice — ${bible.voiceGuide}`,
    `Style — ${bible.styleGuide}`,
    `Setting — ${bible.setting.world}; era ${bible.setting.era}; rules ${bible.setting.rules}; tone ${bible.setting.atmosphere}`,
    `Structural spine — ${bible.structure.actBreakdown}`,
    `Inciting / midpoint / climax / resolution — ${bible.structure.inciting} / ${bible.structure.midpoint} / ${bible.structure.climax} / ${bible.structure.resolution}`,
    `Characters (${bible.characters.length})\n${bible.characters
      .map(
        (c) =>
          `- ${c.name} (${c.role}): motivation ${c.motivation}; arc ${c.arc}; ties ${c.relationships}`
      )
      .join("\n")}`,
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════
// WRITER PROMPTS — produce ONE batch using blueprint + rolling summaries
// ════════════════════════════════════════════════════════════════

export function buildWriterSystemPrompt(): string {
  return `You are Folio, a master literary novelist executing a planned manuscript one batch at a time.

You will be given:
1. The complete Book Blueprint (canon — never contradict it)
2. The ENTIRE manuscript written so far, in full
3. A StoryState ledger (facts, character statuses, open threads) indexing that manuscript
4. The blueprint for the SPECIFIC batch you are writing right now (the beats you must hit)

You can see the whole book. Use it. Physical objects keep the state the text last
gave them: a weapon that was fired is emptier, a knife left in a body stays there,
a wound is on the side the text put it, supplies that were traded away are gone.
Check the manuscript before you write any detail that the story has established
before, and never reintroduce something the text already resolved.

Your job: write THE PROSE for the assigned batch, honoring every element of the blueprint and every canonical detail of the book plan.

# ABSOLUTE RULES

- Write only the prose for THIS batch. Do not skip ahead, do not summarize, do not recap.
- The Folio reader already surfaces chapter headings. Jump straight into narration; avoid opening paragraphs that duplicate them (patterns like Chapter 5, Chapter V:, or repeating the chapter title as a standalone slug line unless the blueprint truly calls for visible in-world typesetting).
- Honor the blueprint's voice, tense, POV, world rules, and character canon without exception.
- Hit every scene beat listed in the blueprint, in roughly the listed order. You may add connective tissue but may not drop or swap beats.
- Respect continuityFlags verbatim — these are non-negotiable facts the reader already knows.
- Characters speak in the voice defined for them in the blueprint.
- LENGTH IS A HARD CONSTRAINT, not a suggestion. Each batch states a word range with a ceiling. Land inside it. Never exceed the ceiling. Running long is the single most common failure in this pipeline: it inflates the book past the length the reader ordered and costs them money.
- If the beats will not fit the range, compress description and transitional material. Never drop a beat, and never rush an ending to hit a number.
- Keep stateDelta brief: a few newFacts, characterUpdates, threadsOpened, and threadsResolved at most.

# CRAFT

- Confident literary prose. Show, don't tell. Sensory detail, rhythm, subtext.
- Open with momentum. Land in a moment, not in exposition.
- End on forward motion appropriate to positionInChapter:
  - "opening" of chapter: set the chapter's central tension in motion
  - "middle" of chapter: complicate, deepen, turn
  - "closing" of chapter: land on an image or beat that punctuates the chapter (but do NOT wrap the book unless this is the final batch)
  - "single"-batch chapter: self-contained arc with a clean landing
- No author's notes, no meta-commentary, no placeholders, no "[...]".
- Dialogue should sound like the specific character, not like a generic narrator.

# PUNCTUATION — ABSOLUTE EM-DASH BAN

The em dash character (U+2014, "—") is forbidden in your output. Zero tolerance.
The en dash character (U+2013, "–") is also forbidden when used as a sentence-level punctuation mark.
The double-hyphen substitute ("--") is also forbidden.
This is the single most visible AI-prose tell and the user will reject any draft that contains one.

TARGET: exactly ZERO dash-based clause breaks in every batch you produce. Count them before you output. If you see an em dash anywhere in your draft, rewrite that sentence before returning it.

How to write the same ideas WITHOUT dashes:

- Aside or parenthetical  →  use commas, or parentheses, or split into a new sentence.
  ✗  "He had a badge — she had seen it once, in passing."
  ✓  "He had a badge. She had seen it once, in passing."
  ✓  "He had a badge (she had seen it once, in passing)."
- Appositive / renaming  →  use commas.
  ✗  "The Compiler — the man Maren had begun calling him that — did not have a file."
  ✓  "The Compiler, the man Maren had begun calling him that, did not have a file."
- Elaboration / colon-ish expansion  →  use a colon, or a period.
  ✗  "She found it — a reading room."
  ✓  "She found it: a reading room."
  ✓  "She found it. A reading room."
- Linking two independent clauses  →  use a period, semicolon, or conjunction.
  ✗  "The stairwell smelled different — older."
  ✓  "The stairwell smelled different. Older."
- Dramatic pause or beat  →  use a period and a short sentence. Line breaks and single-sentence paragraphs carry more weight than a dash anyway.
- Interrupted dialogue  →  trail off with an ellipsis inside the quote, OR cut the sentence with a period and a beat.
  ✗  "Wait—"
  ✓  "Wait…"
  ✓  "Wait. Don't."

Stylistic rhythm comes from varied sentence length, paragraphing, and deliberate word choice. It does NOT come from dashes. A dash-free paragraph should feel more confident, not less.

Before returning prose: search your draft for "—", "–", and "--". If any exist, rewrite them using the guidance above.

# FINAL BATCH

If this is the final batch of the book, the story MUST END here — climax resolved, final image placed. No cliffhangers, no deferred sequel hook, no "the real journey begins" ending, and no unresolved central conflict. Even dev-short books must feel complete.

# OUTPUT (structured)

- prose: the literary text of this batch. No headings except an optional chapter title line at the top when positionInChapter is "opening" or "single" (format: "Chapter N — Title" on its own line, then a blank line, then prose).
- summary: 2–3 sentences of plot facts that happened in this batch. Factual, not evaluative. This becomes memory for future batches.
- openThreads: one to three sentences naming dangling threads / promises / unresolved tensions for the next batch to pick up (legacy display string).
- stateDelta: compact continuity updates for this batch only:
  - newFacts: short factual strings
  - characterUpdates: {name, status}
  - threadsOpened: {id, description} using planned threadLedger ids when applicable (concise stable ids like "letter-secret")
  - threadsResolved: {id} exact ids only — never fuzzy substring matches
  Keep each list short.`;
}

interface WriterPromptParams {
  input: ProjectInput;
  bible: StoryBible;
  blueprint: BatchBlueprint;
  /** Complete prose of every prior batch in the window, ascending. Append-only. */
  manuscriptBatches: Batch[];
  /** Older batches beyond the token budget, summary only. Normally empty. */
  summarizedBatches: Batch[];
  storyState?: StoryState;
  isFinalBatch: boolean;
  totalWords: number;
  targetWords: number;
  /** Adaptive word budget for this batch, correcting cumulative drift. */
  length: LengthGuidance;
  /** Optional critique issues injected for revise passes */
  critiqueFixes?: string;
}

function serializeStoryState(state: StoryState | undefined): string {
  if (!state) return "(empty — beginning of book)";
  const facts = state.facts?.length
    ? state.facts.map((f) => `- ${f}`).join("\n")
    : "- (none yet)";
  const chars = state.characters?.length
    ? state.characters.map((c) => `- ${c.name}: ${c.status}`).join("\n")
    : "- (none yet)";
  const threads = state.openThreads?.length
    ? state.openThreads
        .map((t) =>
          typeof t === "string"
            ? `- ${t}`
            : `- [${t.id}] ${t.description} (opened batch ${t.openedBatch})`
        )
        .join("\n")
    : "- (none)";
  return `Facts:\n${facts}\nCharacters:\n${chars}\nOpen threads:\n${threads}`;
}

export function buildWriterUserPrompt(params: WriterPromptParams): string {
  const {
    input,
    bible,
    blueprint,
    manuscriptBatches,
    summarizedBatches,
    storyState,
    isFinalBatch,
    totalWords,
    targetWords,
    length,
    critiqueFixes,
  } = params;

  const threadLedgerBlock =
    bible.threadLedger && bible.threadLedger.length
      ? bible.threadLedger
          .map(
            (t) =>
              `- [${t.id}] ${t.description} (plant ~batch ${t.plantBatch}, resolve by ~${t.resolveByBatch})`
          )
          .join("\n")
      : "(none planned)";

  const progressPct = Math.min(100, Math.round((totalWords / targetWords) * 100));

  // Full character bible (stable across batches for prompt-cache prefix)
  const allCharacterLines = bible.characters.length
    ? bible.characters
        .map(
          (c) =>
            `- ${c.name} (${c.role}). ${c.description}\n    Voice: ${c.voice}\n    Motivation: ${c.motivation}\n    Arc: ${c.arc}`
        )
        .join("\n")
    : "(no characters in bible)";

  // Per-batch relevance note (variable — placed after stable canon)
  const presentNames = blueprint.charactersPresent.join(", ") || "(none flagged)";

  // Only populated when the manuscript exceeded the token budget.
  const droppedSummaryBlock = summarizedBatches.length
    ? summarizedBatches
        .map(
          (b) =>
            `- §${b.batchNumber}${b.chapterTitle ? ` (Ch.${b.chapterNumber} "${b.chapterTitle}")` : ""}: ${b.chapterSummary ?? "—"}`
        )
        .join("\n")
    : "";

  // The manuscript so far, in full. Append-only, so this is the cache prefix.
  let manuscriptChapter: number | undefined;
  const manuscriptBlock = manuscriptBatches.length
    ? manuscriptBatches
        .map((b) => {
          const parts: string[] = [];
          if (b.chapterNumber != null && b.chapterNumber !== manuscriptChapter) {
            manuscriptChapter = b.chapterNumber;
            parts.push(
              `## Chapter ${b.chapterNumber}${b.chapterTitle ? ` — "${b.chapterTitle}"` : ""}`
            );
          }
          parts.push(`### §${b.batchNumber}`);
          parts.push(b.prose);
          return parts.join("\n\n");
        })
        .join("\n\n")
    : "(this is the opening batch of the book — nothing has been written yet)";

  const earlierBlock = droppedSummaryBlock
    ? `# EARLIER CHAPTERS (summary only — beyond the context budget)
${droppedSummaryBlock}

`
    : "";

  // STABLE prefix first (cache-friendly), then PER-BATCH content last.
  return `# BOOK BLUEPRINT (CANON — OBEY)

## Title
${bible.title}

## Logline
${bible.logline}

## Synopsis
${bible.synopsis}

## Premise
${bible.premise}

## Setting
- World: ${bible.setting.world}
- Era: ${bible.setting.era}
- Rules: ${bible.setting.rules}
- Atmosphere: ${bible.setting.atmosphere}

## Voice Guide
${bible.voiceGuide}

## Style Guide
${bible.styleGuide}

## Themes
${bible.themes.map((t) => `- ${t}`).join("\n")}

## Structural Beats
- Act breakdown: ${bible.structure.actBreakdown}
- Inciting: ${bible.structure.inciting}
- Midpoint: ${bible.structure.midpoint}
- Climax: ${bible.structure.climax}
- Resolution: ${bible.structure.resolution}

## Full Character Bible
${allCharacterLines}

## Thread Ledger (planned ids — prefer these in stateDelta)
${threadLedgerBlock}

# USER'S ORIGINAL IDEA (for flavor reference only — canon is the blueprint)
${input.idea}

${earlierBlock}# THE MANUSCRIPT SO FAR

Everything written up to this point, in full. Read it. It is the ground truth for
what has already happened, who is alive, what they are carrying, what they know,
and how the narration sounds. Where this text and the blueprint disagree about a
detail already on the page, the text wins and you carry the contradiction forward
consistently rather than correcting it mid-scene.

Do not recap it, do not repeat its phrasing, and do not reuse its images. Continue
from it.

${manuscriptBlock}

# BLUEPRINT FOR THIS BATCH (batch ${blueprint.number} of ${bible.totalBatches})

- Chapter: ${blueprint.chapterNumber} — "${blueprint.chapterTitle}"
- Position in chapter: ${blueprint.positionInChapter}
- Setting: ${blueprint.settingLocation}
- Tone: ${blueprint.toneNote}
- Purpose: ${blueprint.purpose}
- Characters present this batch: ${presentNames}
- Scene beats to hit (in order):
${blueprint.scenes.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}
- Continuity flags (MUST respect):
${blueprint.continuityFlags.length ? blueprint.continuityFlags.map((f) => `  - ${f}`).join("\n") : "  - (none)"}
- WORD BUDGET: target ${length.targetWords.toLocaleString()}, acceptable range ${length.minWords.toLocaleString()}-${length.maxWords.toLocaleString()}. HARD CEILING ${length.maxWords.toLocaleString()} words. Count as you go.

# STORY STATE (continuity ledger — an index into the manuscript above, not a replacement for it)
${serializeStoryState(storyState)}

# CURRENT STATE
- Words written so far: ${totalWords.toLocaleString()} / ${targetWords.toLocaleString()} (${progressPct}%)
${length.correction ? `- LENGTH CORRECTION: ${length.correction}` : "- Length is on plan. Stay inside the range for this batch."}
- You are writing BATCH ${blueprint.number} of ${bible.totalBatches}
${isFinalBatch ? "- THIS IS THE FINAL BATCH. The story MUST END. Land the climax and place the closing image." : ""}
${critiqueFixes ? `\n# MANDATORY CRITIQUE FIXES\n${critiqueFixes}\n` : ""}
# YOUR TASK
Write batch ${blueprint.number} now. Hit every blueprint beat. Obey blueprint canon. Return structured output: prose, summary, openThreads, stateDelta.`;
}

// ════════════════════════════════════════════════════════════════
// CRITIC / REVISE / VERIFY PROMPTS — chapter-close quality gate
// ════════════════════════════════════════════════════════════════

export function buildCriticSystemPrompt(): string {
  return `You are Folio's continuity critic. You review ONE completed chapter.

Judge only for high-severity continuity breaks or clearly missed chapter beats from the plan.
- verdict "revise" ONLY when there is a high-severity continuity break OR a clearly missed chapter beat.
- Low/medium issues alone must yield verdict "pass".
- batchNumber on each issue MUST be an absolute 1-based manuscript batch number from the allowed list.
- Be concise. Do not rewrite prose. Do not invent new plot.

No em dashes in your text fields.`;
}

export function buildCriticUserPrompt(params: {
  chapterPlan: {
    number: number;
    title: string;
    summary: string;
    arcPurpose: string;
    openingHook: string;
    closingBeat: string;
  };
  blueprints: {
    number: number;
    purpose: string;
    scenes: string[];
    continuityFlags: string[];
  }[];
  batchSummaries: { batchNumber: number; summary: string }[];
  allowedBatchNumbers: number[];
  storyStateBeforeText: string;
  storyStateAfterText: string;
  /** The complete chapter. Sampling excerpts hid four fifths of the text. */
  chapterProse: string;
}): string {
  const {
    chapterPlan,
    blueprints,
    batchSummaries,
    allowedBatchNumbers,
    storyStateBeforeText,
    storyStateAfterText,
    chapterProse,
  } = params;
  const summaryBlock = batchSummaries
    .map((b) => `- Batch ${b.batchNumber}: ${b.summary}`)
    .join("\n");
  const blueprintBlock = blueprints
    .map(
      (b) =>
        `### Batch ${b.number}\nPurpose: ${b.purpose}\nScenes: ${b.scenes.join("; ")}\nFlags: ${b.continuityFlags.join("; ") || "(none)"}`
    )
    .join("\n\n");

  return `# CHAPTER PLAN
- Chapter ${chapterPlan.number}: "${chapterPlan.title}"
- Summary: ${chapterPlan.summary}
- Arc purpose: ${chapterPlan.arcPurpose}
- Opening hook: ${chapterPlan.openingHook}
- Closing beat: ${chapterPlan.closingBeat}

# ALLOWED ABSOLUTE BATCH NUMBERS (use only these in issues[].batchNumber)
${allowedBatchNumbers.join(", ")}

# BATCH BLUEPRINTS
${blueprintBlock || "(none)"}

# BATCH SUMMARIES FOR THIS CHAPTER
${summaryBlock || "(none)"}

# STORY STATE BEFORE CHAPTER
${storyStateBeforeText}

# STORY STATE AFTER CHAPTER
${storyStateAfterText}

# FULL CHAPTER PROSE
${chapterProse}

# YOUR TASK
Read the entire chapter above, then return structured critique: issues (with absolute batchNumber), beatsMissed, verdict (pass|revise).`;
}

export function buildPlanAuditorSystemPrompt(): string {
  return `You are Folio's plan auditor. Review a complete Book Blueprint before human approval.

Flag only HIGH-severity structural/canon defects that require targeted repair:
- batch/chapter coverage gaps or overlaps
- incomplete ending / missing resolution
- broken setup/payoff
- invalid thread ledger (bad ids, impossible plant/resolve batches)
- character arc inconsistency
- POV/tense/style contradictions
- concrete continuity flags that conflict
- target-length infeasibility

verdict "repair" ONLY when high-severity issues exist. Otherwise "pass".
Be concise. No em dashes.`;
}

export function buildPlanAuditorUserPrompt(params: {
  bible: StoryBible;
  targetWords: number;
}): string {
  const { bible, targetWords } = params;
  const chapterLines = bible.chapters
    .map(
      (c) =>
        `- Ch ${c.number} "${c.title}" batches ${c.batchStart}-${c.batchEnd} (~${c.targetWords}w): ${c.summary}`
    )
    .join("\n");
  const batchLines = bible.batches
    .map(
      (b) =>
        `- B${b.number} Ch${b.chapterNumber} [${b.positionInChapter}] ${b.purpose}`
    )
    .join("\n");
  const ledger = (bible.threadLedger ?? [])
    .map(
      (t) =>
        `- [${t.id}] plant ${t.plantBatch} resolveBy ${t.resolveByBatch}: ${t.description}`
    )
    .join("\n");

  return `# TARGET WORDS
${targetWords}

# TITLE / LOGLINE
${bible.title} — ${bible.logline}

# STRUCTURE
${bible.structure.actBreakdown}
Inciting: ${bible.structure.inciting}
Midpoint: ${bible.structure.midpoint}
Climax: ${bible.structure.climax}
Resolution: ${bible.structure.resolution}

# VOICE / STYLE
${bible.voiceGuide}
${bible.styleGuide}

# CHARACTERS
${bible.characters.map((c) => `- ${c.name} (${c.role}): arc=${c.arc}`).join("\n")}

# CHAPTERS (${bible.chapters.length})
${chapterLines}

# BATCHES (${bible.batches.length} / totalBatches=${bible.totalBatches})
${batchLines}

# THREAD LEDGER
${ledger || "(empty)"}

# YOUR TASK
Return structured audit: issues, verdict (pass|repair), summary.`;
}

export function buildPlanRepairSystemPrompt(): string {
  return `You are Folio's plan repair specialist. Apply TARGETED fixes only.

Return complete replacement objects for flagged chapters, batches, and/or thread ledger entries.
Do NOT rewrite the entire bible. Use stable chapter numbers, batch numbers, and thread ids.
No em dashes.`;
}

export function buildPlanRepairUserPrompt(params: {
  bible: StoryBible;
  issues: PlanAuditIssue[];
}): string {
  const { bible, issues } = params;
  const issueLines = issues
    .map(
      (issue, index) =>
        `${index + 1}. [${issue.category}] chapter=${issue.chapterNumber ?? "n/a"} batch=${issue.batchNumber ?? "n/a"}\n   ${issue.repairInstruction}`
    )
    .join("\n");
  return `# HIGH-SEVERITY AUDIT ISSUES (repair exactly these)
${issueLines || "(none; return null replacement arrays)"}

# CURRENT BIBLE (JSON excerpt — repair by replacement entries)
Title: ${bible.title}
Chapters: ${bible.chapters.length}
Batches: ${bible.batches.length}
Thread ledger entries: ${(bible.threadLedger ?? []).length}

Chapters JSON:
${JSON.stringify(bible.chapters)}

Batches JSON:
${JSON.stringify(bible.batches)}

Thread ledger JSON:
${JSON.stringify(bible.threadLedger ?? [])}

# YOUR TASK
Return chapterReplacements / batchReplacements / threadLedgerReplacements as complete objects for items that need fixing (or null arrays if none).`;
}

export function buildRevisionVerifierSystemPrompt(): string {
  return `You verify whether a single revised batch fixed the critique issues.

You are reading the complete revised batch, so absence of a fix is evidence, not
uncertainty. Return fixed=true only if the mandatory issues appear addressed.
List any remainingIssues briefly. Reporting fixed=false may trigger exactly one
more revision attempt, so do not report false unless you can name what is still
wrong.
No em dashes.`;
}

export function buildRevisionVerifierUserPrompt(params: {
  batchNumber: number;
  chapterNumber: number;
  issues: { description: string; severity: string; batchNumber: number }[];
  beatsMissed: string[];
  summary: string;
  /** The complete revised batch. A 400-word excerpt could not see a fix made later in the text. */
  revisedProse: string;
  storyStateBeforeText: string;
  storyStateAfterText: string;
}): string {
  const {
    batchNumber,
    chapterNumber,
    issues,
    beatsMissed,
    summary,
    revisedProse,
    storyStateBeforeText,
    storyStateAfterText,
  } = params;
  return `# REVISED BATCH ${batchNumber} (chapter ${chapterNumber})

# ORIGINAL ISSUES
${issues.map((i) => `- [${i.severity}] batch ${i.batchNumber}: ${i.description}`).join("\n")}

# MISSED BEATS
${beatsMissed.map((b) => `- ${b}`).join("\n") || "(none)"}

# REVISED SUMMARY
${summary}

# FULL REVISED PROSE
${revisedProse}

# STORY STATE BEFORE BATCH
${storyStateBeforeText}

# STORY STATE THROUGH REVISED BATCH
${storyStateAfterText}

# YOUR TASK
Return fixed, remainingIssues, notes.`;
}
