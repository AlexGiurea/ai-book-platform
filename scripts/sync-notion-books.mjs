import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const NOTION_VERSION = "2022-06-28";

async function loadLocalEnv() {
  try {
    const env = await readFile(resolve(".env.local"), "utf8");
    for (const line of env.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index);
      const value = trimmed
        .slice(index + 1)
        .replace(/^"(.*)"$/, "$1")
        .replace(/^'(.*)'$/, "$1");
      process.env[key] = value;
    }
  } catch {
    // .env.local is optional outside local development.
  }
}

function truncate(value, max = 1900) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function richText(value) {
  const content = truncate(value);
  return { rich_text: content ? [{ text: { content } }] : [] };
}

function select(value) {
  return { select: value ? { name: value } : null };
}

function date(value) {
  return { date: value ? { start: value } : null };
}

function isExternalUrl(value) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function multiSelectName(value) {
  return truncate(value.replace(/,/g, ";"), 100);
}

function buildPayload(project, databaseId) {
  const coverUrl = isExternalUrl(project.coverUrl) ? project.coverUrl : undefined;
  const properties = {
    Book: { title: [{ text: { content: project.title || "Untitled book" } }] },
    "Project ID": richText(project.id),
    "User Email": { email: project.userEmail || null },
    "User ID": richText(project.userId),
    Plan: select(project.plan),
    Status: select(project.status),
    Genre: richText(project.genre),
    Tone: richText(project.tone),
    Length: select(project.length),
    POV: richText(project.pov),
    "Image Style": select(project.imageStyle || "none"),
    "Input Mode": select(project.inputMode || "text"),
    "Target Words": { number: project.targetWords },
    "Total Words": { number: project.totalWords },
    "Expected Batches": { number: project.expectedBatches },
    "Batch Count": { number: project.batchCount },
    "Completion Percent": { number: project.completionPercent },
    "Cover Status": select(project.coverStatus),
    "Cover URL": { url: coverUrl || null },
    Synopsis: richText(project.synopsis),
    Premise: richText(project.premise),
    Logline: richText(project.logline),
    Themes: {
      multi_select: project.themes
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

async function notionFetch(token, path, init) {
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
    throw new Error(`Notion ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function findExistingPage(token, databaseId, projectId) {
  const result = await notionFetch(token, `/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        property: "Project ID",
        rich_text: { equals: projectId },
      },
      page_size: 1,
    }),
  });
  return result.results?.[0]?.id;
}

async function syncProject(token, databaseId, project) {
  const pageId = await findExistingPage(token, databaseId, project.id);
  if (pageId) {
    await notionFetch(token, `/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(buildPayload(project)),
    });
    return "updated";
  }

  await notionFetch(token, "/pages", {
    method: "POST",
    body: JSON.stringify(buildPayload(project, databaseId)),
  });
  return "created";
}

await loadLocalEnv();

const token = process.env.NOTION_API_KEY || process.env.NOTION_TOKEN;
const databaseId = process.env.NOTION_BOOKS_DATABASE_ID;
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!token) {
  console.error("NOTION_API_KEY or NOTION_TOKEN is required.");
  process.exit(1);
}
if (!databaseId) {
  console.error("NOTION_BOOKS_DATABASE_ID is required.");
  process.exit(1);
}
if (!connectionString) {
  console.error("DATABASE_URL or POSTGRES_URL is required.");
  process.exit(1);
}

const sql = neon(connectionString);
const rows = await sql`
  select p.id, p.user_id, u.email, p.plan, p.status, p.target_words, p.total_words,
         p.expected_batches, p.title, p.synopsis, p.cover_status, p.cover,
         p.input, p.bible, p.created_at, p.updated_at,
         (select count(*)::int from book_batches b where b.project_id = p.id) as batch_count
  from projects p
  left join users u on u.id = p.user_id
  order by p.created_at desc
`;

let created = 0;
let updated = 0;

for (const row of rows) {
  const batchCount = Number(row.batch_count ?? 0);
  const expectedBatches = Number(row.expected_batches ?? 0);
  const action = await syncProject(token, databaseId, {
    id: row.id,
    userId: row.user_id,
    userEmail: row.email,
    plan: row.plan,
    status: row.status,
    title: row.title || row.bible?.title,
    synopsis: row.synopsis || row.bible?.synopsis,
    targetWords: Number(row.target_words ?? 0),
    totalWords: Number(row.total_words ?? 0),
    expectedBatches,
    batchCount,
    completionPercent: expectedBatches
      ? Math.min(100, Math.round((batchCount / expectedBatches) * 100))
      : 0,
    coverStatus: row.cover_status,
    coverUrl: row.cover?.imageUrl,
    genre: row.input?.preferences?.genre,
    length: row.input?.preferences?.length,
    tone: row.input?.preferences?.tone,
    pov: row.input?.preferences?.pov,
    imageStyle: row.input?.preferences?.imageStyle,
    inputMode: row.input?.inputMode,
    premise: row.bible?.premise,
    logline: row.bible?.logline,
    themes: row.bible?.themes ?? [],
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  });

  if (action === "created") created += 1;
  if (action === "updated") updated += 1;
  console.log(`${action}: ${row.title || row.id}`);
}

console.log(`Notion sync complete. Created ${created}, updated ${updated}.`);
