import { NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth/verification";
import { getAppBaseUrl } from "@/lib/app-url";
import { durableRateLimit } from "@/lib/security/durable-rate-limit";
import { clientIp } from "@/lib/security/request";

export const runtime = "nodejs";

/**
 * Confirm an address from the link in the email.
 *
 * A GET that changes state, because it is reached by clicking a link in a mail
 * client and nothing else is possible there. It is safe to replay: consuming an
 * already-consumed token reports success rather than an error, since a reader
 * who clicks twice has done nothing wrong.
 *
 * Rate limited durably by IP — the token is unguessable, but without a ceiling
 * this endpoint is a free database query for anyone who wants to hammer it.
 */
export async function GET(request: Request) {
  const limited = await durableRateLimit({
    key: "auth:verify",
    subject: clientIp(request),
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const token = new URL(request.url).searchParams.get("token") ?? "";
  const result = await verifyToken(token);
  const base = getAppBaseUrl(request);

  if (!result.ok) {
    return NextResponse.redirect(
      `${base}/signin?verified=${encodeURIComponent(result.reason)}`,
      { status: 303 }
    );
  }

  return NextResponse.redirect(`${base}/dashboard?verified=1`, { status: 303 });
}
