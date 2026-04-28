import Stripe from "stripe";
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

export function getAppBaseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ??
    new URL(request.url).origin
  ).replace(/\/$/, "");
}

export function getPriceIdForPlan(plan: SubscriptionPlan): string | null {
  if (plan !== "pro") return null;
  return process.env[PLAN_DEFINITIONS.pro.stripePriceEnv ?? ""] ?? null;
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
  const plan: SubscriptionPlan =
    status === "active" || status === "trialing" ? "pro" : "free";

  await getSql()`
    update users
    set plan = ${plan},
        stripe_subscription_id = ${subscription.id},
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

  await getSql()`
    update users
    set plan = 'free',
        stripe_subscription_id = ${subscription.id},
        stripe_subscription_status = ${subscription.status},
        stripe_current_period_end = null,
        updated_at = now()
    where stripe_customer_id = ${customerId}
  `;
}
