/**
 * Changing somebody's plan, and what that does to the month they are in.
 *
 * The rule, stated once here so it is not re-decided in three places:
 *
 *   Words already spent stay spent. The allowance is always read from the plan
 *   held RIGHT NOW.
 *
 * Upgrading therefore takes effect immediately — a Free account that has used
 * all 12,000 words and moves to Author is instantly at 12,000 of 40,000, with
 * 28,000 available. Downgrading is also immediate and can leave usage above the
 * new allowance; that reads as zero remaining rather than as debt, and the next
 * month resets it. Nobody is charged for the difference and nobody is refunded,
 * because no money moves here at all — this is entitlement, not billing.
 *
 * The alternative, pro-rating the allowance across a mid-month switch, buys
 * fairness measured in a few thousand words and costs a rule nobody can predict
 * from their own dashboard. Not worth it.
 */

import { getSql, hasDatabaseUrl } from "@/lib/db/postgres";
import { normalizePlan, type SubscriptionPlan } from "./allowance";

export type PlanChangeReason =
  | "signup"
  | "stripe_subscription"
  | "stripe_cancelled"
  | "admin"
  | "owner_bootstrap";

export interface PlanChange {
  id: string;
  userId: string;
  fromPlan: SubscriptionPlan | null;
  toPlan: SubscriptionPlan;
  reason: string;
  actor: string | null;
  createdAt: string;
}

/**
 * Move an account to a plan and record why.
 *
 * Returns false when the plan is already what was asked for, so a Stripe
 * webhook replaying the same subscription event does not fill the audit log
 * with identical rows.
 */
export async function setUserPlan(input: {
  userId: string;
  plan: unknown;
  reason: PlanChangeReason;
  actor?: string;
}): Promise<{ changed: boolean; from: SubscriptionPlan | null; to: SubscriptionPlan }> {
  const to = normalizePlan(input.plan);
  if (!hasDatabaseUrl()) return { changed: false, from: null, to };

  const sql = getSql();
  const rows = (await sql`
    select plan from users where id = ${input.userId} limit 1
  `) as { plan: string | null }[];
  if (!rows.length) return { changed: false, from: null, to };

  const from = normalizePlan(rows[0].plan);
  if (from === to) return { changed: false, from, to };

  await sql`
    update users
    set plan = ${to}, updated_at = now()
    where id = ${input.userId}
  `;
  await sql`
    insert into plan_changes (user_id, from_plan, to_plan, reason, actor)
    values (${input.userId}, ${from}, ${to}, ${input.reason}, ${input.actor ?? null})
  `;

  console.info(
    `[plans] ${input.userId} ${from} -> ${to} (${input.reason}${input.actor ? ` by ${input.actor}` : ""})`
  );
  return { changed: true, from, to };
}

export async function planHistory(
  userId: string,
  limit = 20
): Promise<PlanChange[]> {
  if (!hasDatabaseUrl()) return [];
  const rows = (await getSql()`
    select id, user_id, from_plan, to_plan, reason, actor, created_at
    from plan_changes
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `) as {
    id: string | number;
    user_id: string;
    from_plan: string | null;
    to_plan: string;
    reason: string;
    actor: string | null;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: String(r.id),
    userId: r.user_id,
    fromPlan: r.from_plan ? normalizePlan(r.from_plan) : null,
    toPlan: normalizePlan(r.to_plan),
    reason: r.reason,
    actor: r.actor,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}
