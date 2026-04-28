import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import {
  getAppBaseUrl,
  getStripe,
  hasStripeBillingConfig,
} from "@/lib/billing/stripe";
import { rateLimit, rejectCrossOrigin } from "@/lib/security/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const crossOrigin = rejectCrossOrigin(request);
  if (crossOrigin) return crossOrigin;

  const limited = rateLimit(request, {
    key: "billing:portal",
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasStripeBillingConfig()) {
    return NextResponse.json(
      { error: "Stripe billing is prepared in code but not configured yet." },
      { status: 503 }
    );
  }

  const customerId = user.billing?.stripeCustomerId;
  if (!customerId) {
    return NextResponse.json(
      { error: "No Stripe customer exists for this account yet." },
      { status: 409 }
    );
  }

  const baseUrl = getAppBaseUrl(request);
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/settings`,
  });

  return NextResponse.json({ url: session.url });
}
