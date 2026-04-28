import { NextResponse } from "next/server";
import { getSql } from "@/lib/db/postgres";
import { getCurrentUser } from "@/lib/auth/session";
import {
  rateLimit,
  readJsonLimited,
  rejectCrossOrigin,
} from "@/lib/security/request";

export const runtime = "nodejs";

const fontScales = new Set(["compact", "comfortable", "spacious"]);
const tones = new Set(["literary", "warm", "epic", "playful", "clinical"]);
const lengths = new Set(["short", "standard", "long"]);

type SettingsPayload = {
  reduceMotion?: unknown;
  warmTheme?: unknown;
  emailUpdates?: unknown;
  readerFontScale?: unknown;
  defaultTone?: unknown;
  defaultLength?: unknown;
};

function normalizeSettings(input: SettingsPayload) {
  return {
    reduceMotion:
      typeof input.reduceMotion === "boolean" ? input.reduceMotion : false,
    warmTheme: typeof input.warmTheme === "boolean" ? input.warmTheme : true,
    emailUpdates:
      typeof input.emailUpdates === "boolean" ? input.emailUpdates : true,
    readerFontScale:
      typeof input.readerFontScale === "string" &&
      fontScales.has(input.readerFontScale)
        ? input.readerFontScale
        : "comfortable",
    defaultTone:
      typeof input.defaultTone === "string" && tones.has(input.defaultTone)
        ? input.defaultTone
        : "literary",
    defaultLength:
      typeof input.defaultLength === "string" && lengths.has(input.defaultLength)
        ? input.defaultLength
        : "standard",
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = (await getSql()`
    select settings from users where id = ${user.id} limit 1
  `) as { settings: SettingsPayload | null }[];

  return NextResponse.json({
    preferences: normalizeSettings(rows[0]?.settings ?? {}),
  });
}

export async function PUT(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const limited = rateLimit(request, {
    key: "settings:update",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = await readJsonLimited(request, 16 * 1024);
  if ("response" in parsed) return parsed.response;

  const preferences = normalizeSettings(parsed.data as SettingsPayload);
  await getSql()`
    update users
    set settings = ${JSON.stringify(preferences)}::jsonb,
        updated_at = now()
    where id = ${user.id}
  `;

  return NextResponse.json({ preferences });
}
