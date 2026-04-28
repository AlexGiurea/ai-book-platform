import { NextResponse } from "next/server";
import {
  createSession,
  createUser,
  setSessionCookie,
  validateSignupInput,
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
    key: "auth:signup",
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const body = await readJsonLimited(request, 16 * 1024);
  if ("response" in body) return body.response;
  const parsed = validateSignupInput({
    name: (body.data as { name?: unknown })?.name,
    email: (body.data as { email?: unknown })?.email,
    password: (body.data as { password?: unknown })?.password,
  });

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const user = await createUser(parsed);
    const session = await createSession(user.id);
    const response = NextResponse.json({ user });
    setSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("users_email_normalized")) {
      return NextResponse.json(
        { error: "An account with that email already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
