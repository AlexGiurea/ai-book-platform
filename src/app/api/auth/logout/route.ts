import { NextResponse } from "next/server";
import { clearSessionCookie, destroyCurrentSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  await destroyCurrentSession();
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
