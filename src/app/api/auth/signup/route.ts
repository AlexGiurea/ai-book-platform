import { NextResponse } from "next/server";
import {
  createSession,
  createUser,
  setSessionCookie,
  validateSignupInput,
} from "@/lib/auth/session";
import { sendVerificationEmail } from "@/lib/auth/verification";
import { getAppBaseUrl } from "@/lib/app-url";
import { durableRateLimit } from "@/lib/security/durable-rate-limit";
import {
  clientIp,
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

  // Account creation is exactly what the in-memory limiter cannot hold: it
  // counts per serverless instance, so the real ceiling was 10 x however many
  // instances happened to be warm. This one is shared.
  const durable = await durableRateLimit({
    key: "auth:signup",
    subject: clientIp(request),
    limit: 5,
    windowMs: 60 * 60_000,
    message: "Too many accounts created from this address. Try again later.",
  });
  if (durable) return durable;

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

    // Best effort. A mail failure must not cost someone their account — they
    // can ask for another link from the dashboard.
    let verificationSent = false;
    try {
      const sent = await sendVerificationEmail({
        userId: user.id,
        email: user.email,
        emailNormalized: user.email.trim().toLowerCase(),
        name: user.name,
        baseUrl: getAppBaseUrl(request),
      });
      verificationSent = sent.delivered;
    } catch (err) {
      console.error(
        "[signup] verification email failed:",
        err instanceof Error ? err.message : String(err)
      );
    }

    const session = await createSession(user.id);
    const response = NextResponse.json({ user, verificationSent });
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
