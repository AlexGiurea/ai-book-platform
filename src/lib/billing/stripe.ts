import Stripe from "stripe";
import { getAppBaseUrl } from "@/lib/app-url";
import { setUserPlan } from "./plan-changes";
import { getSql } from "@/lib/db/postgres";
import type { AuthUser } from "@/lib/auth/session";
import { PLAN_DEFINITIONS, type SubscriptionPlan } from "@/lib/plans";

export const STRIPE_API_VERSION = "2026-04-22.dahlia";

let cachedStripe: Stripe | null = null;

export function hasStripeBillingConfig(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID);
}

export function getStripe(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  if (!cachedStripe) {
    cachedStripe = new Stripe(apiKey, {
      apiVersion: STRIPE_API_VERSION,
      appInfo: {
        name: "Folio",
        version: "0.1.0",
      },
    });
  }
  return cachedStripe;
}

/** @see @/lib/app-url — re-exported so existing imports keep working. */
export { getAppBaseUrl };

export function getPriceIdForPlan(plan: SubscriptionPlan): string | null {
  const env = PLAN_DEFINITIONS[plan].stripePriceEnv;
  if (!env) return null;
  return process.env[env] ?? null;
}

/** Reverse lookup, so a webhook can tell which tier was actually bought. */
export function getPlanForPriceId(priceId: string | null): SubscriptionPlan | null {
  if (!priceId) return null;
  for (const definition of Object.values(PLAN_DEFINITIONS)) {
    if (!definition.stripePriceEnv) continue;
    if (process.env[definition.stripePriceEnv] === priceId) return definition.id;
  }
  return null;
}

export async function getOrCreateStripeCustomer(user: AuthUser): Promise<string> {
  if (user.billing?.stripeCustomerId) return user.billing.stripeCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: {
      userId: user.id,
      app: "folio",
    },
  });

  await getSql()`
    update users
    set stripe_customer_id = ${customer.id},
        updated_at = now()
    where id = ${user.id}
  `;

  return customer.id;
}

export async function syncSubscriptionToUser(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const status = subscription.status;
  const periodEnd = subscription.items.data[0]?.current_period_end
    ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
    : null;
  // Which tier, not merely "paid" — the two paid plans have different
  // allowances, so resolving the price back to a plan is load-bearing.
  const active = status === "active" || status === "trialing";
  const plan: SubscriptionPlan = active
    ? getPlanForPriceId(priceId) ?? "author"
    : "free";

  // Words already spent stay spent; the allowance is read from the plan held
  // now, so an upgrade takes effect immediately and a downgrade reads as zero
  // remaining rather than as debt. See @/lib/billing/plan-changes.
  const owner = (await getSql()`
    select id from users where stripe_customer_id = ${customerId} limit 1
  `) as { id: string }[];
  if (owner[0]) {
    await setUserPlan({
      userId: owner[0].id,
      plan,
      reason: active ? "stripe_subscription" : "stripe_cancelled",
      actor: `stripe:${subscription.id}`,
    });
  }

  // `plan` is deliberately absent — setUserPlan above owns that column, and
  // writing it here too would move somebody between tiers with no audit row.
  await getSql()`
    update users
    set stripe_subscription_id = ${subscription.id},
        stripe_subscription_status = ${status},
        stripe_price_id = ${priceId},
        stripe_current_period_end = ${periodEnd},
        updated_at = now()
    where stripe_customer_id = ${customerId}
  `;
}

export async function markStripeSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const owner = (await getSql()`
    select id from users where stripe_customer_id = ${customerId} limit 1
  `) as { id: string }[];
  if (owner[0]) {
    await setUserPlan({
      userId: owner[0].id,
      plan: "free",
      reason: "stripe_cancelled",
      actor: `stripe:${subscription.id}`,
    });
  }

  await getSql()`
    update users
    set stripe_subscription_id = ${subscription.id},
        stripe_subscription_status = ${subscription.status},
        stripe_current_period_end = null,
        updated_at = now()
    where stripe_customer_id = ${customerId}
  `;
}
