/**
 * Email verification.
 *
 * The gate is on *spending*, not on signing in. Someone can create an account
 * and look around unverified; they cannot start a book, because that is the
 * action that costs money — a free account runs roughly $0.30 to $1.30 of model
 * calls, and signup asks for nothing but an address.
 *
 * Only the SHA-256 of each token is stored. A dump of this table must not hand
 * anyone a working verification link.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSql, hasDatabaseUrl } from "@/lib/db/postgres";
import { hasMailProvider, sendEmail } from "@/lib/email/send";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** New links per address per hour. Enough to survive a spam folder. */
export const MAX_SENDS_PER_HOUR = 5;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Whether an unverified account should be blocked from generating.
 *
 * False when no mail provider is configured: gating on a link the app cannot
 * deliver would lock every new account out of the product with no way through.
 * `FOLIO_REQUIRE_EMAIL_VERIFICATION=false` forces it off even with a provider.
 */
export function verificationRequired(): boolean {
  const flag = process.env.FOLIO_REQUIRE_EMAIL_VERIFICATION?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return hasMailProvider();
}

export function verificationUrl(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/auth/verify?token=${encodeURIComponent(token)}`;
}

/** Mint a token, store its hash, and return the raw token exactly once. */
export async function issueVerificationToken(input: {
  userId: string;
  emailNormalized: string;
}): Promise<{ token: string; expiresAt: string } | null> {
  if (!hasDatabaseUrl()) return null;
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await getSql()`
    insert into email_verifications (token_hash, user_id, email_normalized, expires_at)
    values (${hashToken(token)}, ${input.userId}, ${input.emailNormalized}, ${expiresAt})
  `;

  return { token, expiresAt };
}

export async function sendsInLastHour(emailNormalized: string): Promise<number> {
  if (!hasDatabaseUrl()) return 0;
  const rows = (await getSql()`
    select count(*)::int as n
    from email_verifications
    where email_normalized = ${emailNormalized}
      and created_at > now() - interval '1 hour'
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function sendVerificationEmail(input: {
  userId: string;
  email: string;
  emailNormalized: string;
  name?: string | null;
  baseUrl: string;
}): Promise<{ sent: boolean; delivered: boolean; reason?: string }> {
  if ((await sendsInLastHour(input.emailNormalized)) >= MAX_SENDS_PER_HOUR) {
    return { sent: false, delivered: false, reason: "rate_limited" };
  }

  const issued = await issueVerificationToken({
    userId: input.userId,
    emailNormalized: input.emailNormalized,
  });
  if (!issued) return { sent: false, delivered: false, reason: "no_database" };

  const link = verificationUrl(issued.token, input.baseUrl);
  const greeting = input.name?.trim() ? `Hello ${input.name.trim()},` : "Hello,";

  const result = await sendEmail({
    to: input.email,
    subject: "Confirm your email for Folio",
    text: [
      greeting,
      "",
      "Confirm this address to start writing books with Folio:",
      "",
      link,
      "",
      "The link works for 24 hours. If you did not create a Folio account, you can ignore this — nothing will happen.",
      "",
      "Folio",
    ].join("\n"),
  });

  return { sent: true, delivered: result.delivered, reason: result.error };
}

export type VerifyOutcome =
  | { ok: true; userId: string; alreadyVerified: boolean }
  | { ok: false; reason: "invalid" | "expired" | "consumed" };

/**
 * Consume a token. Constant-time comparison is not enough on its own here —
 * the lookup is by hash, so a wrong token simply finds no row.
 */
export async function verifyToken(token: string): Promise<VerifyOutcome> {
  if (!hasDatabaseUrl()) return { ok: false, reason: "invalid" };
  const raw = token?.trim();
  if (!raw) return { ok: false, reason: "invalid" };

  const sql = getSql();
  const hash = hashToken(raw);
  const rows = (await sql`
    select token_hash, user_id, expires_at, consumed_at
    from email_verifications
    where token_hash = ${hash}
    limit 1
  `) as {
    token_hash: string;
    user_id: string;
    expires_at: string;
    consumed_at: string | null;
  }[];

  const record = rows[0];
  if (!record) return { ok: false, reason: "invalid" };

  // Defence in depth against a future lookup that is not an exact-match index.
  const provided = Buffer.from(hash);
  const stored = Buffer.from(record.token_hash);
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
    return { ok: false, reason: "invalid" };
  }

  if (record.consumed_at) {
    // A second click on the same link is a success from the reader's side.
    return { ok: true, userId: record.user_id, alreadyVerified: true };
  }
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  await sql`
    update email_verifications
    set consumed_at = now()
    where token_hash = ${hash} and consumed_at is null
  `;
  const updated = (await sql`
    update users
    set email_verified_at = coalesce(email_verified_at, now()),
        updated_at = now()
    where id = ${record.user_id}
    returning email_verified_at
  `) as { email_verified_at: string }[];

  return {
    ok: true,
    userId: record.user_id,
    alreadyVerified: updated.length === 0,
  };
}

export async function isEmailVerified(userId: string): Promise<boolean> {
  if (!hasDatabaseUrl()) return true;
  const rows = (await getSql()`
    select email_verified_at from users where id = ${userId} limit 1
  `) as { email_verified_at: string | null }[];
  return Boolean(rows[0]?.email_verified_at);
}
