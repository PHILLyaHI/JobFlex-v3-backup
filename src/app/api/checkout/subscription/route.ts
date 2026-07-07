import { NextResponse } from "next/server";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { readAttributionCookie, validateAttribution } from "@/lib/attribution";
import { getPlanBySlug } from "@/lib/planCatalogServer";

// Real SaaS subscription checkout. A captured influencer promo (the org's
// permanent signup stamp, falling back to the 30-day capture cookie) is
// auto-applied as the Stripe discount; otherwise allow_promotion_codes lets the
// customer type a code at Stripe. Either way, attribution-of-record is read
// back off the resulting subscription in the webhook (never from this request).
// Billing is owner-only: managers run operations, not the money.
export async function POST(req: Request) {
  const { organizationId, user } = await requireOwner();
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  const { planSlug, interval } = await req.json().catch(() => ({}));
  if (!planSlug || !interval) {
    return NextResponse.json({ error: "planSlug and interval are required." }, { status: 400 });
  }
  if (interval !== "MONTH" && interval !== "YEAR") {
    return NextResponse.json({ error: "interval must be MONTH or YEAR." }, { status: 400 });
  }

  // The PricingPlan row is the source of truth for what's sellable; the
  // PlanPrice mirror below is only the Stripe charge handle.
  const plan = await getPlanBySlug(String(planSlug), { includeInactive: true });
  if (!plan) {
    return NextResponse.json({ error: "Unknown plan." }, { status: 404 });
  }
  if (!plan.active) {
    return NextResponse.json({ error: "This plan is no longer available." }, { status: 410 });
  }
  if (plan.isFree) {
    return NextResponse.json(
      { error: "The free plan doesn't go through checkout — switch plans from your subscription page." },
      { status: 400 },
    );
  }
  if (interval === "YEAR" && !plan.yearlyPriceCents) {
    return NextResponse.json({ error: "This plan has no yearly option." }, { status: 400 });
  }

  const price = await db.planPrice.findFirst({
    where: { planSlug: plan.slug, interval, active: true },
  });
  if (!price) {
    return NextResponse.json({ error: "That plan isn't available for checkout yet." }, { status: 404 });
  }

  const [sub, org] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    db.organization.findUnique({
      where: { id: organizationId },
      select: { signupPromoCodeId: true },
    }),
  ]);

  // Resolve a promo to auto-apply. Both paths re-validate against the DB (the
  // cookie is untrusted input); a dead/suspended code simply resolves to null.
  // local_promo_* synthetics (Stripe-disabled dev) never reach Stripe.
  let autoApplyPromotionCode: string | null = null;
  if (org?.signupPromoCodeId) {
    const stamped = await db.promoCode.findUnique({
      where: { id: org.signupPromoCodeId },
      select: {
        active: true,
        stripePromotionCodeId: true,
        influencer: { select: { status: true } },
      },
    });
    if (stamped?.active && stamped.influencer.status === "ACTIVE") {
      autoApplyPromotionCode = stamped.stripePromotionCodeId;
    }
  }
  if (!autoApplyPromotionCode) {
    const captured = await readAttributionCookie();
    if (captured?.k === "promo") {
      const validated = await validateAttribution("promo", captured.c);
      if (validated?.kind === "promo") autoApplyPromotionCode = validated.stripePromotionCodeId;
    }
  }
  if (autoApplyPromotionCode && !autoApplyPromotionCode.startsWith("promo_")) {
    autoApplyPromotionCode = null;
  }

  const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const stripe = getStripe();
  const baseParams = {
    mode: "subscription" as const,
    line_items: [{ price: price.stripePriceId, quantity: 1 }],
    ...(sub?.externalCustomerId
      ? { customer: sub.externalCustomerId }
      : { customer_email: user.email ?? undefined }),
    subscription_data: {
      metadata: { organizationId },
      ...(plan.trialDays ? { trial_period_days: plan.trialDays } : {}),
    },
    metadata: { organizationId },
    success_url: `${origin}/dashboard/settings/account?upgraded=1`,
    cancel_url: `${origin}/dashboard/settings/account`,
  };

  // Stripe forbids combining `discounts` with `allow_promotion_codes`, so it's
  // one or the other. If Stripe rejects the pre-applied code (deactivated or
  // expired on their side), fall back to plain checkout with manual code entry.
  let session;
  if (autoApplyPromotionCode) {
    try {
      session = await stripe.checkout.sessions.create({
        ...baseParams,
        discounts: [{ promotion_code: autoApplyPromotionCode }],
      });
    } catch {
      session = await stripe.checkout.sessions.create({ ...baseParams, allow_promotion_codes: true });
    }
  } else {
    session = await stripe.checkout.sessions.create({ ...baseParams, allow_promotion_codes: true });
  }

  return NextResponse.json({ url: session.url });
}
