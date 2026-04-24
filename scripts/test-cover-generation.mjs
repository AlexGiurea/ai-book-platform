import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

async function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const text = await readFile(envPath, "utf8").catch(() => "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

const prompt = `Create premium front cover artwork for a literary speculative novel.

Book title for context only: The Orchard at the End of Time
Do not render any text, title, author name, subtitle, logo, watermark, label, or readable typography. The application will overlay text separately.

Visual style: painterly literary cover illustration.
Format: vertical book cover art, portrait composition, 1024x1536 aspect. Leave calm negative space in the upper third and lower quarter for title typography overlays.

Story premise:
In a coastal town where abandoned orchards preserve moments from the future instead of fruit, a widowed clockmaker discovers one tree growing the last morning of her own life. To change what she has seen, she must decide whether grief is a warning, a map, or the one thing time cannot revise.

Cover direction:
- Represent one strong symbolic scene: a moonlit orchard above a dark sea, glassy fruit holding tiny reflections of different possible dawns, and a solitary figure near an old brass clockwork gate.
- Make it atmospheric, emotionally precise, and collectible, like a serious publisher's literary front cover.
- Avoid spoilers, horror gore, collage, UI, mockup, book object, frame, or typography.
- Generate only the flat cover artwork.`;

async function main() {
  await loadEnvLocal();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env.local before running this script.");
  }

  const model = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
  const client = new OpenAI({ apiKey });

  console.log(`[cover-test] Generating test cover with ${model}...`);
  const response = await client.images.generate({
    model,
    prompt,
    n: 1,
    size: "1024x1536",
    quality: "medium",
    output_format: "png",
    background: "opaque",
    moderation: "auto",
    user: "folio-cover-test",
  });

  const image = response.data?.[0];
  if (!image?.b64_json) {
    throw new Error("Image generation returned no base64 image data.");
  }

  const dir = path.join(process.cwd(), "public", "generated", "covers");
  await mkdir(dir, { recursive: true });
  const fileName = `test-cover-${Date.now()}.png`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, Buffer.from(image.b64_json, "base64"));

  console.log(`[cover-test] Success`);
  console.log(`[cover-test] File: ${filePath}`);
  console.log(`[cover-test] App URL: /generated/covers/${fileName}`);
}

main().catch((error) => {
  console.error(`[cover-test] Failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
