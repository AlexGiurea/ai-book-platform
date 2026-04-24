import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getImageModelName, getOpenAIClient } from "./openai-client";
import { store } from "./context-store";
import type { BookCover, StoryBible } from "./types";

const COVER_SIZE = "1024x1536";
const COVER_OUTPUT_FORMAT = "png";
const COVER_QUALITY = "medium";

function compactList(items: string[], max = 5): string {
  return items.filter(Boolean).slice(0, max).join(", ");
}

function styleLabel(style: string): string {
  const labels: Record<string, string> = {
    none: "refined literary cover art",
    painterly: "painterly literary cover illustration",
    lineart: "elegant line art with restrained color",
    watercolor: "watercolor literary illustration",
    darkink: "dark ink illustration with dramatic contrast",
    cinematic: "cinematic key art with literary restraint",
  };
  return labels[style] ?? (style || "refined literary cover art");
}

function buildCoverPrompt(bible: StoryBible, imageStyle: string): string {
  const primaryCharacters = bible.characters
    .slice(0, 3)
    .map((c) => `${c.name}, ${c.role}: ${c.description}`)
    .join("\n");

  return `Create a premium front cover artwork for a finished book.

Book title for context only: ${bible.title}
Do not render any text, title, author name, subtitle, logo, watermark, label, or readable typography. The application will overlay text separately.

Visual style: ${styleLabel(imageStyle)}.
Format: vertical book cover art, portrait composition, ${COVER_SIZE} aspect. Leave calm negative space in the upper third and lower quarter for title typography overlays.

Story logline:
${bible.logline}

Synopsis:
${bible.synopsis}

World and atmosphere:
- World: ${bible.setting.world}
- Era: ${bible.setting.era}
- Atmosphere: ${bible.setting.atmosphere}
- Rules: ${bible.setting.rules}

Themes: ${compactList(bible.themes)}

Primary character references:
${primaryCharacters || "No specific character depiction required."}

Cover direction:
- Represent the central emotional promise of the story, not a literal collage of every plot point.
- Use one strong focal image or symbolic scene drawn from the premise, setting, and protagonist arc.
- Avoid spoilers from the climax or resolution.
- Make it feel like a serious publisher's literary cover: distinctive, atmospheric, polished, and collectible.
- No UI, no mockup, no book object, no pages, no frame. Generate only the flat cover artwork.`;
}

export interface CoverGenerationResult {
  cover: BookCover;
}

export class CoverAgent {
  async generateCover(projectId: string): Promise<CoverGenerationResult> {
    const project = store.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    if (!project.bible) throw new Error("Cannot generate cover before a bible exists");

    const model = getImageModelName();
    const prompt = buildCoverPrompt(project.bible, project.input.preferences.imageStyle);
    const client = getOpenAIClient();

    store.updateCoverStatus(projectId, "generating");
    store.appendEvent(projectId, { type: "cover_start", model });

    try {
      const response = await client.images.generate({
        model,
        prompt,
        n: 1,
        size: COVER_SIZE,
        quality: COVER_QUALITY,
        output_format: COVER_OUTPUT_FORMAT,
        background: "opaque",
        moderation: "auto",
        user: projectId,
      });

      const image = response.data?.[0];
      if (!image?.b64_json) {
        throw new Error("Image generation returned no base64 image data");
      }

      const dir = path.join(process.cwd(), "public", "generated", "covers");
      await mkdir(dir, { recursive: true });
      const fileName = `${projectId}.png`;
      const filePath = path.join(dir, fileName);
      await writeFile(filePath, Buffer.from(image.b64_json, "base64"));

      const cover: BookCover = {
        imageUrl: `/generated/covers/${fileName}`,
        prompt,
        model,
        createdAt: new Date().toISOString(),
      };

      store.setCover(projectId, cover);
      store.appendEvent(projectId, {
        type: "cover_complete",
        model,
        coverImageUrl: cover.imageUrl,
      });

      return { cover };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      store.updateCoverStatus(projectId, "failed", msg);
      store.appendEvent(projectId, { type: "cover_failed", error: msg, model });
      throw err;
    }
  }
}

export const coverAgent = new CoverAgent();
