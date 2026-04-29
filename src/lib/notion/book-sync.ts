import type { BookProject } from "@/lib/agent/types";

const NOTION_VERSION = "2022-06-28";

type NotionPropertyValue =
  | { title: { text: { content: string } }[] }
  | { rich_text: { text: { content: string } }[] }
  | { select: { name: string } | null }
  | { multi_select: { name: string }[] }
  | { number: number | null }
  | { email: string | null }
  | { url: string | null }
  | { date: { start: string } | null };

type NotionPagePayload = {
  parent?: { database_id: string };
  properties: Record<string, NotionPropertyValue>;
  cover?: { type: "external"; external: { url: string } } | null;
};

type NotionQueryResponse = {
  results?: { id: string }[];
};

function getNotionConfig() {
  const token = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_BOOKS_DATABASE_ID;
  if (!token || !databaseId) return null;
  return { token, databaseId };
}

function truncate(value: string | undefined, max = 1900): string {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function richText(value: string | undefined): NotionPropertyValue {
  const content = truncate(value);
  return { rich_text: content ? [{ text: { content } }] : [] };
}

function select(value: string | undefined): NotionPropertyValue {
  return { select: value ? { name: value } : null };
}

function date(value: string | undefined): NotionPropertyValue {
  return { date: value ? { start: value } : null };
}

function isExternalUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function multiSelectName(value: string): string {
  return truncate(value.replace(/,/g, ";"), 100);
}

function completionPercent(project: BookProject): number {
  if (!project.expectedBatches) return 0;
  return Math.min(
    100,
    Math.round((project.batches.length / project.expectedBatches) * 100)
  );
}

function buildPayload(project: BookProject, databaseId?: string): NotionPagePayload {
  const coverUrl = isExternalUrl(project.cover?.imageUrl)
    ? project.cover.imageUrl
    : undefined;
  const properties: Record<string, NotionPropertyValue> = {
    Book: { title: [{ text: { content: project.title || project.bible?.title || "Untitled book" } }] },
    "Project ID": richText(project.id),
    "User Email": { email: project.userEmail ?? null },
    "User ID": richText(project.userId),
    Plan: select(project.plan),
    Status: select(project.status),
    Genre: richText(project.input.preferences.genre),
    Tone: richText(project.input.preferences.tone),
    Length: select(project.input.preferences.length),
    POV: richText(project.input.preferences.pov),
    "Image Style": select(project.input.preferences.imageStyle || "none"),
    "Input Mode": select(project.input.inputMode),
    "Target Words": { number: project.targetWords },
    "Total Words": { number: project.totalWords },
    "Expected Batches": { number: project.expectedBatches },
    "Batch Count": { number: project.batches.length },
    "Completion Percent": { number: completionPercent(project) },
    "Cover Status": select(project.coverStatus),
    "Cover URL": { url: coverUrl ?? null },
    Synopsis: richText(project.synopsis || project.bible?.synopsis),
    Premise: richText(project.bible?.premise),
    Logline: richText(project.bible?.logline),
    Themes: {
      multi_select: (project.bible?.themes ?? [])
        .filter(Boolean)
        .slice(0, 20)
        .map((name) => ({ name: multiSelectName(name) })),
    },
    "Created At": date(project.createdAt),
    "Updated At": date(project.updatedAt),
    "Last Synced At": date(new Date().toISOString()),
  };

  return {
    ...(databaseId ? { parent: { database_id: databaseId } } : {}),
    properties,
    ...(coverUrl ? { cover: { type: "external", external: { url: coverUrl } } } : {}),
  };
}

async function notionFetch<T>(
  token: string,
  path: string,
  init: RequestInit
): Promise<T> {
  const response = await fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Notion sync failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

async function findExistingPage(
  token: string,
  databaseId: string,
  projectId: string
): Promise<string | undefined> {
  const result = await notionFetch<NotionQueryResponse>(
    token,
    `/databases/${databaseId}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          property: "Project ID",
          rich_text: { equals: projectId },
        },
        page_size: 1,
      }),
    }
  );
  return result.results?.[0]?.id;
}

export async function syncBookToNotion(project: BookProject): Promise<void> {
  const config = getNotionConfig();
  if (!config) return;

  const pageId = await findExistingPage(config.token, config.databaseId, project.id);
  if (pageId) {
    await notionFetch(config.token, `/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(buildPayload(project)),
    });
    return;
  }

  await notionFetch(config.token, "/pages", {
    method: "POST",
    body: JSON.stringify(buildPayload(project, config.databaseId)),
  });
}
