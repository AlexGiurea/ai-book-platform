import { createHash } from "crypto";
import { toFile } from "openai";
import { getOpenAIClient } from "./openai-client";
import { store } from "./context-store";
import type { Batch, BatchBlueprint, BookProject, StoryBible } from "./types";

type RetrievalMetadata = Record<string, string | number | boolean>;

interface RetrievalDocument {
  sourceType: string;
  sourceId: string;
  title: string;
  content: string;
  metadata?: RetrievalMetadata;
}

const MAX_RETRIEVAL_CHARS = 12000;
const MAX_SEARCH_RESULTS = 8;

function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function safeFilename(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "folio-memory"
  );
}

function truncateForIndex(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_RETRIEVAL_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_RETRIEVAL_CHARS)}\n\n[Content truncated for retrieval indexing.]`;
}

function buildBibleDocuments(project: BookProject, bible: StoryBible): RetrievalDocument[] {
  const input = project.input;
  const docs: RetrievalDocument[] = [
    {
      sourceType: "bible",
      sourceId: "overview",
      title: `${bible.title} - Bible Overview`,
      content: [
        `# ${bible.title}`,
        `Logline: ${bible.logline}`,
        `Premise: ${bible.premise}`,
        `Synopsis: ${bible.synopsis}`,
        `Themes: ${bible.themes.join(", ")}`,
        "",
        "## Setting",
        `World: ${bible.setting.world}`,
        `Era: ${bible.setting.era}`,
        `Rules: ${bible.setting.rules}`,
        `Atmosphere: ${bible.setting.atmosphere}`,
        "",
        "## Structure",
        `Act breakdown: ${bible.structure.actBreakdown}`,
        `Inciting: ${bible.structure.inciting}`,
        `Midpoint: ${bible.structure.midpoint}`,
        `Climax: ${bible.structure.climax}`,
        `Resolution: ${bible.structure.resolution}`,
        "",
        "## Voice",
        bible.voiceGuide,
        "",
        "## Style",
        bible.styleGuide,
      ].join("\n"),
      metadata: { section: "overview" },
    },
    {
      sourceType: "bible",
      sourceId: "characters",
      title: `${bible.title} - Character Bible`,
      content: bible.characters
        .map((character) =>
          [
            `## ${character.name}`,
            `Role: ${character.role}`,
            `Description: ${character.description}`,
            `Voice: ${character.voice}`,
            `Motivation: ${character.motivation}`,
            `Arc: ${character.arc}`,
            `Relationships: ${character.relationships}`,
            character.secrets ? `Secrets: ${character.secrets}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n\n"),
      metadata: { section: "characters" },
    },
    {
      sourceType: "bible",
      sourceId: "chapters",
      title: `${bible.title} - Chapter Briefs`,
      content: bible.chapters
        .map((chapter) =>
          [
            `## Chapter ${chapter.number}: ${chapter.title}`,
            `Batches: ${chapter.batchStart}-${chapter.batchEnd}`,
            `Target words: ${chapter.targetWords}`,
            `Summary: ${chapter.summary}`,
            `Arc purpose: ${chapter.arcPurpose}`,
            `Opening hook: ${chapter.openingHook}`,
            `Closing beat: ${chapter.closingBeat}`,
          ].join("\n")
        )
        .join("\n\n"),
      metadata: { section: "chapters" },
    },
    {
      sourceType: "bible",
      sourceId: "batch-blueprints",
      title: `${bible.title} - Batch Blueprints`,
      content: bible.batches
        .map((batch) =>
          [
            `## Batch ${batch.number}: ${batch.chapterTitle}`,
            `Chapter: ${batch.chapterNumber}`,
            `Position: ${batch.positionInChapter}`,
            `Purpose: ${batch.purpose}`,
            `Characters: ${batch.charactersPresent.join(", ")}`,
            `Setting: ${batch.settingLocation}`,
            `Tone: ${batch.toneNote}`,
            `Scenes:\n${batch.scenes.map((scene) => `- ${scene}`).join("\n")}`,
            `Continuity:\n${batch.continuityFlags.map((flag) => `- ${flag}`).join("\n")}`,
          ].join("\n")
        )
        .join("\n\n"),
      metadata: { section: "batch-blueprints" },
    },
  ];

  input.contextFileContents?.forEach((content, index) => {
    const name = input.contextFileNames?.[index] ?? `Uploaded context ${index + 1}`;
    docs.push({
      sourceType: "upload",
      sourceId: `upload-${index + 1}`,
      title: name,
      content,
      metadata: { section: "uploaded-context", upload_index: index + 1 },
    });
  });

  if (input.canvas) {
    const canvasContent = [
      input.canvas.characters.length
        ? `# Canvas Characters\n${input.canvas.characters
            .map((character) => `- ${character.name}${character.role ? ` (${character.role})` : ""}: ${character.description}`)
            .join("\n")}`
        : "",
      input.canvas.world.length
        ? `# Canvas World\n${input.canvas.world
            .map((entry) => `## ${entry.title}\n${entry.content}`)
            .join("\n\n")}`
        : "",
      input.canvas.notes.length
        ? `# Canvas Notes\n${input.canvas.notes
            .map((note, index) => `- ${note.title || `Note ${index + 1}`}: ${note.content}`)
            .join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    if (canvasContent) {
      docs.push({
        sourceType: "canvas",
        sourceId: "user-canvas",
        title: "User Creative Canvas",
        content: canvasContent,
        metadata: { section: "user-canvas" },
      });
    }
  }

  return docs;
}

async function createVectorStore(projectId: string, title?: string): Promise<string> {
  const client = getOpenAIClient();
  const vectorStore = await client.vectorStores.create({
    name: `folio-${safeFilename(title || projectId)}-${projectId}`,
    description: "Project memory for Folio long-form book generation.",
    expires_after: { anchor: "last_active_at", days: 30 },
    metadata: { project_id: projectId },
  });
  await store.setVectorStoreId(projectId, vectorStore.id);
  return vectorStore.id;
}

async function ensureVectorStore(project: BookProject): Promise<string> {
  if (project.vectorStoreId) return project.vectorStoreId;
  return createVectorStore(project.id, project.title || project.bible?.title);
}

async function uploadDocument(
  project: BookProject,
  vectorStoreId: string,
  doc: RetrievalDocument
): Promise<void> {
  const content = truncateForIndex(doc.content);
  if (!content) return;

  const hash = contentHash(content);
  const exists = await store.hasRetrievalDocument(
    project.id,
    doc.sourceType,
    doc.sourceId,
    hash,
    vectorStoreId
  );
  if (exists) return;

  const client = getOpenAIClient();
  const filename = `${safeFilename(doc.sourceType)}-${safeFilename(doc.sourceId)}.md`;
  const uploaded = await client.files.create({
    file: await toFile(Buffer.from(content, "utf8"), filename, {
      type: "text/markdown",
    }),
    purpose: "user_data",
  });

  const vectorFile = await client.vectorStores.files.createAndPoll(vectorStoreId, {
    file_id: uploaded.id,
    attributes: {
      project_id: project.id,
      source_type: doc.sourceType,
      source_id: doc.sourceId,
      title: doc.title.slice(0, 512),
      ...(doc.metadata ?? {}),
    },
    chunking_strategy: {
      type: "static",
      static: {
        max_chunk_size_tokens: 1200,
        chunk_overlap_tokens: 200,
      },
    },
  });

  await store.recordRetrievalDocument({
    projectId: project.id,
    sourceType: doc.sourceType,
    sourceId: doc.sourceId,
    title: doc.title,
    contentHash: hash,
    vectorStoreId,
    openaiFileId: uploaded.id,
    vectorStoreFileId: vectorFile.id,
    metadata: doc.metadata ?? {},
  });
}

export async function indexProjectMemory(
  projectId: string,
  bible: StoryBible
): Promise<void> {
  const project = await store.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const vectorStoreId = await createVectorStore(project.id, bible.title);
  for (const doc of buildBibleDocuments(project, bible)) {
    await uploadDocument(project, vectorStoreId, doc);
  }
}

export async function indexBatchMemory(projectId: string, batch: Batch): Promise<void> {
  const project = await store.getProject(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const vectorStoreId = await ensureVectorStore(project);
  await uploadDocument(project, vectorStoreId, {
    sourceType: "batch",
    sourceId: `batch-${batch.batchNumber}`,
    title: `Batch ${batch.batchNumber}${batch.chapterTitle ? ` - ${batch.chapterTitle}` : ""}`,
    content: [
      `# Batch ${batch.batchNumber}`,
      batch.chapterNumber ? `Chapter: ${batch.chapterNumber}` : "",
      batch.chapterTitle ? `Chapter title: ${batch.chapterTitle}` : "",
      batch.chapterSummary ? `Summary: ${batch.chapterSummary}` : "",
      "",
      "## Prose",
      batch.prose,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: {
      section: "generated-batch",
      batch_number: batch.batchNumber,
      chapter_number: batch.chapterNumber ?? 0,
    },
  });
}

export async function retrieveRelevantMemory(
  projectId: string,
  blueprint: BatchBlueprint
): Promise<string> {
  const project = await store.getProject(projectId);
  if (!project?.vectorStoreId) return "";

  const query = [
    `Chapter ${blueprint.chapterNumber}: ${blueprint.chapterTitle}`,
    `Batch purpose: ${blueprint.purpose}`,
    `Characters: ${blueprint.charactersPresent.join(", ")}`,
    `Setting: ${blueprint.settingLocation}`,
    `Scenes: ${blueprint.scenes.join(" ")}`,
    `Continuity: ${blueprint.continuityFlags.join(" ")}`,
  ].join("\n");

  const client = getOpenAIClient();
  const page = await client.vectorStores.search(project.vectorStoreId, {
    query,
    max_num_results: MAX_SEARCH_RESULTS,
    rewrite_query: true,
    ranking_options: {
      ranker: "auto",
      score_threshold: 0.1,
    },
  });

  if (!page.data.length) return "";

  return page.data
    .map((result, index) => {
      const body = result.content
        .map((part) => part.text)
        .join("\n")
        .trim();
      return [
        `## Retrieved memory ${index + 1}`,
        `Source: ${result.filename}`,
        `Score: ${result.score.toFixed(3)}`,
        body,
      ].join("\n");
    })
    .join("\n\n");
}
