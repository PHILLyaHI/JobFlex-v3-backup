import { NextResponse } from "next/server";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";

// Real SaaS subscription checkout. allow_promotion_codes lets the customer enter
// an influencer's code at Stripe — we then read the applied promotion_code off
// the resulting subscription/invoice in the webhook (never from this request).
export async function POST(req: Request) {
  const { organizationId, user } = await requireManager();
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const { planSlug, interval } = await req.json().catch(() => ({}));
  if (!planSlug || !interval) {
    return NextResponse.json({ error: "planSlug and interval are required." }, { status: 400 });
  }

  const price = await db.planPrice.findFirst({
    where: { planSlug, interval, active: true },
  });
  if (!price) {
    return NextResponse.json({ error: "That plan isn't available for checkout yet." }, { status: 404 });
  }

  const [plan, sub] = await Promise.all([
    db.pricingPlan.findUnique({ where: { slug: planSlug } }),
    db.subscription.findUnique({ where: { organizationId } }),
  ]);

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: price.stripePriceId, quantity: 1 }],
    allow_promotion_codes: true,
    ...(sub?.externalCustomerId
      ? { customer: sub.externalCustomerId }
      : { customer_email: user.email ?? undefined }),
    subscription_data: {
      metadata: { organizationId },
      ...(plan?.trialDays ? { trial_period_days: plan.trialDays } : {}),
    },
    metadata: { organizationId },
    success_url: `${origin}/dashboard/settings/account?upgraded=1`,
    cancel_url: `${origin}/dashboard/settings/account`,
  });

  return NextResponse.json({ url: session.url });
}
