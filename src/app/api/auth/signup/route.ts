import { NextResponse } from "next/server";
import {
  createSession,
  createUser,
  setSessionCookie,
  validateSignupInput,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = validateSignupInput({
    name: body?.name,
    email: body?.email,
    password: body?.password,
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
