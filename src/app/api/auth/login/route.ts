import { NextResponse } from "next/server";
import {
  authenticateUser,
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  rateLimit,
  readJsonLimited,
  rejectCrossOrigin,
} from "@/lib/security/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const limited = rateLimit(request, {
    key: "auth:login",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const parsed = await readJsonLimited(request, 16 * 1024);
  if ("response" in parsed) return parsed.response;
  const body = parsed.data as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  const user = await authenticateUser(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const session = await createSession(user.id);
  const response = NextResponse.json({ user });
  setSessionCookie(response, session.token, session.expiresAt);
  return response;
}
