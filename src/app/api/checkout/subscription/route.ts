import { NextResponse } from "next/server";
import { appBaseUrl } from "@/lib/appUrl";
import { requireOwner } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { readAttributionCookie, validateAttribution } from "@/lib/attribution";
import { getPlanBySlug } from "@/lib/planCatalogServer";
import { ensureRecurringPrice } from "@/lib/stripePriceCache";

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
    // $0 plans have nothing to charge — they cannot form a Stripe Checkout
    // Session. Not reachable from the UI (no $0 plan is offered), kept as
    // defense against a hand-crafted request.
    return NextResponse.json(
      { error: "This plan can't be purchased through checkout." },
      { status: 400 },
    );
  }
  if (interval === "YEAR" && !plan.yearlyPriceCents) {
    return NextResponse.json({ error: "This plan has no yearly option." }, { status: 400 });
  }

  // Mode-aware: the admin's live/sandbox switch (lib/stripeMode) decides which
  // account this session lands on. Resolved BEFORE the mirror lookup, because
  // only the live path needs a mirror at all.
  const { stripe, mode } = await getStripeClient();

  /* The PlanPrice mirror is the LIVE account's price of record; the sandbox
     has no such ids, so test mode prices inline from the catalog row instead —
     which also means a plan that was never synced can still be TRIALLED in the
     sandbox, and only its live checkout says "not available yet". */
  let livePriceId: string | null = null;
  if (mode === "live") {
    const price = await db.planPrice.findFirst({
      where: { planSlug: plan.slug, interval, active: true },
    });
    if (!price) {
      return NextResponse.json({ error: "That plan isn't available for checkout yet." }, { status: 404 });
    }
    livePriceId = price.stripePriceId;
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


  // Redirect targets come from the platform-set host, never the caller's
  // Origin header — a forged Origin minted a real, contractor-branded checkout
  // whose post-payment landing page was an attacker domain.
  const origin = await appBaseUrl();
  // A stored promo_… id belongs to the LIVE account; on the sandbox it would
  // 400 the session. Test runs fall back to typing a code on Stripe's page.
  if (mode === "test") autoApplyPromotionCode = null;
  const cents = interval === "YEAR" ? (plan.yearlyPriceCents ?? 0) : plan.priceCents;
  // Sandbox path: a REUSED test-account price (lib/stripePriceCache), never
  // inline price_data — inline mints a fresh Product per checkout and would
  // litter the dashboard.
  const lineItem = livePriceId
    ? { price: livePriceId, quantity: 1 }
    : {
        price: await ensureRecurringPrice({
          stripe,
          mode,
          kind: plan.slug,
          name: `JobFlex ${plan.name}`,
          interval,
          cents,
        }),
        quantity: 1,
      };
  const baseParams = {
    mode: "subscription" as const,
    line_items: [lineItem],
    ...(sub?.externalCustomerId && mode === "live"
      ? { customer: sub.externalCustomerId }
      : { customer_email: user.email ?? undefined }),
    subscription_data: {
      metadata: { organizationId },
      ...(plan.trialDays ? { trial_period_days: plan.trialDays } : {}),
    },
    // planSlug/interval ride the session so the upgrade page can verify the
    // return and write the plan change itself — the live webhook cannot see
    // sandbox events, and even live, the page landing first beats waiting.
    metadata: { organizationId, planSlug: plan.slug, interval },
    success_url: `${origin}/dashboard/upgrade?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/upgrade?checkout=cancelled`,
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
