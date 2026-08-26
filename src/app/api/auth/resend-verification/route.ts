import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  MAX_SENDS_PER_HOUR,
  sendVerificationEmail,
} from "@/lib/auth/verification";
import { getAppBaseUrl } from "@/lib/app-url";
import { durableRateLimit } from "@/lib/security/durable-rate-limit";
import { rejectCrossOrigin } from "@/lib/security/request";

export const runtime = "nodejs";

/**
 * Send a fresh confirmation link to the signed-in account's own address.
 *
 * Scoped to the caller's own email on purpose — accepting an address in the
 * body would turn this into an open relay for sending mail to strangers.
 */
export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  if (user.emailVerifiedAt) {
    return NextResponse.json({ ok: true, alreadyVerified: true });
  }

  const limited = await durableRateLimit({
    key: "auth:resend-verification",
    subject: user.id,
    limit: MAX_SENDS_PER_HOUR,
    windowMs: 60 * 60_000,
    message: "Too many confirmation emails. Try again in an hour.",
  });
  if (limited) return limited;

  const result = await sendVerificationEmail({
    userId: user.id,
    email: user.email,
    emailNormalized: user.email.trim().toLowerCase(),
    name: user.name,
    baseUrl: getAppBaseUrl(request),
  });

  if (!result.sent) {
    return NextResponse.json(
      { error: "Could not send a confirmation email just now." },
      { status: 429 }
    );
  }

  // `delivered: false` means no mail provider is configured and the link went
  // to the server log instead. Reported honestly rather than as a success.
  return NextResponse.json({ ok: true, delivered: result.delivered });
}
