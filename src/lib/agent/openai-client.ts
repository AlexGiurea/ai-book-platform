import OpenAI from "openai";

let cached: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (cached) return cached;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env.local before generating a book."
    );
  }
  cached = new OpenAI({ apiKey });
  return cached;
}

export function getModelName(): string {
  return process.env.OPENAI_MODEL ?? "gpt-5.5";
}

export function getImageModelName(): string {
  return process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-2";
}
