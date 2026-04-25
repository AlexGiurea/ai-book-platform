import { NextResponse } from "next/server";
import {
  authenticateUser,
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const password = typeof body?.password === "string" ? body.password : "";

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
