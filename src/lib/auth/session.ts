import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { getSql, hasDatabaseUrl } from "@/lib/db/postgres";
import { makeId } from "@/lib/agent/context-store";
import { DEFAULT_SIGNUP_PLAN, normalizePlan, type SubscriptionPlan } from "@/lib/plans";
import { SESSION_COOKIE } from "./constants";
import { hashPassword, makeSalt, verifyPassword } from "./password";

const SESSION_DAYS = 30;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  plan: SubscriptionPlan;
  createdAt: string;
}

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  plan: string | null;
  password_hash: string;
  password_salt: string;
  created_at: string | Date;
};

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toUser(
  row: Pick<UserRow, "id" | "email" | "name" | "plan" | "created_at">
): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? undefined,
    plan: normalizePlan(row.plan),
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export function assertAuthDatabase() {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is required for account authentication.");
  }
}

export function validateSignupInput(input: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  return { name, email, password };
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  assertAuthDatabase();
  const sql = getSql();
  const salt = makeSalt();
  const passwordHash = await hashPassword(input.password, salt);
  const now = new Date().toISOString();
  const rows = (await sql`
    insert into users (
      id, email, email_normalized, name, plan, password_hash, password_salt, created_at, updated_at
    ) values (
      ${makeId()}, ${input.email.trim()}, ${normalizeEmail(input.email)}, ${input.name || null},
      ${DEFAULT_SIGNUP_PLAN}, ${passwordHash}, ${salt}, ${now}, ${now}
    )
    returning id, email, name, plan, created_at
  `) as Pick<UserRow, "id" | "email" | "name" | "plan" | "created_at">[];
  return toUser(rows[0]);
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<AuthUser | null> {
  assertAuthDatabase();
  const rows = (await getSql()`
    select * from users where email_normalized = ${normalizeEmail(email)} limit 1
  `) as UserRow[];
  const row = rows[0];
  if (!row) return null;

  const ok = await verifyPassword(password, row.password_salt, row.password_hash);
  return ok ? toUser(row) : null;
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  assertAuthDatabase();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = sessionExpiry();
  await getSql()`
    insert into user_sessions (id, user_id, token_hash, expires_at)
    values (${makeId()}, ${userId}, ${hashToken(token)}, ${expiresAt.toISOString()})
  `;
  return { token, expiresAt };
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: Date
) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

export async function destroyCurrentSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !hasDatabaseUrl()) return;
  await getSql()`delete from user_sessions where token_hash = ${hashToken(token)}`;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !hasDatabaseUrl()) return null;

  const rows = (await getSql()`
    select u.id, u.email, u.name, u.plan, u.created_at
    from user_sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
      and s.expires_at > now()
    limit 1
  `) as Pick<UserRow, "id" | "email" | "name" | "plan" | "created_at">[];
  return rows[0] ? toUser(rows[0]) : null;
}
