import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  markStripeSubscriptionDeleted,
  syncSubscriptionToUser,
} from "@/lib/billing/stripe";
import { getSql } from "@/lib/db/postgres";

export const runtime = "nodejs";

async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const rows = (await getSql()`
    insert into billing_events (id, type, payload)
    values (${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb)
    on conflict (id) do nothing
    returning id, processed_at
  `) as { id: string; processed_at: string | null }[];
  if (rows.length > 0) return true;

  const existing = (await getSql()`
    select processed_at from billing_events where id = ${event.id} limit 1
  `) as { processed_at: string | null }[];
  return !existing[0]?.processed_at;
}

async function markEventProcessed(eventId: string) {
  await getSql()`
    update billing_events
    set processed_at = now(),
        processing_error = null
    where id = ${eventId}
  `;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Stripe webhook signing is not configured." },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid webhook" },
      { status: 400 }
    );
  }

  const shouldProcess = await claimEvent(event);
  if (!shouldProcess) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    await syncSubscriptionToUser(event.data.object as Stripe.Subscription);
  }

  if (event.type === "customer.subscription.deleted") {
    await markStripeSubscriptionDeleted(event.data.object as Stripe.Subscription);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (typeof session.subscription === "string") {
      const subscription = await getStripe().subscriptions.retrieve(session.subscription);
      await syncSubscriptionToUser(subscription);
    }
  }

  await markEventProcessed(event.id);

  return NextResponse.json({ received: true });
}
