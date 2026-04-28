import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getAppBaseUrl,
  getOrCreateStripeCustomer,
  getPriceIdForPlan,
  getStripe,
  hasStripeBillingConfig,
} from "@/lib/billing/stripe";
import { rateLimit, rejectCrossOrigin } from "@/lib/security/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const limited = rateLimit(request, {
    key: "billing:checkout",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in before upgrading." }, { status: 401 });
  }

  if (!hasStripeBillingConfig()) {
    return NextResponse.json(
      { error: "Stripe billing is prepared in code but not configured yet." },
      { status: 503 }
    );
  }

  const priceId = getPriceIdForPlan("pro");
  if (!priceId) {
    return NextResponse.json(
      { error: "STRIPE_PRO_PRICE_ID is required before Checkout can start." },
      { status: 503 }
    );
  }

  const baseUrl = getAppBaseUrl(request);
  const customerId = await getOrCreateStripeCustomer(user);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${baseUrl}/settings?billing=success`,
    cancel_url: `${baseUrl}/pricing?billing=cancelled`,
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
      plan: "pro",
    },
    subscription_data: {
      metadata: {
        userId: user.id,
        plan: "pro",
      },
    },
  });

  return NextResponse.json({ url: session.url });
}
