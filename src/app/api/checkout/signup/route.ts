// CHECKOUT FOR A SIGNUP THAT HAS NO ACCOUNT YET.
//
// The ordinary subscription checkout (../subscription) is owner-scoped: it
// prices for an organization that already exists. This one runs BEFORE the
// organization exists — the visitor is a pending intent parked by
// actions/signupCheckout.ts, identified by an unguessable token, and the
// account is created only when this session comes back complete.
//
// It is deliberately narrow:
//   · the token must resolve to a live pending intent (2h TTL) — no token, no
//     session, so this cannot be used as an anonymous Stripe session factory;
//   · the customer email is taken from the INTENT, never from the request body;
//   · `client_reference_id` carries the token, which is what
//     `completePendingSignup` checks the returned session against.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { getPlanBySlug } from "@/lib/planCatalogServer";
import { readPendingSignup } from "@/actions/signupCheckout";
import { CUSTOM_PLAN_SLUG, customPriceCents } from "@/lib/customPlan";
import { getCustomPlanTrialDays } from "@/lib/customPlanConfig";
import { ensureRecurringPrice } from "@/lib/stripePriceCache";
import { validateAttribution } from "@/lib/attribution";
import { promotionCodeIdForMode } from "@/lib/influencerPromoMode";
import { ensureReferralCoupon, referralCouponMonths } from "@/lib/referralDiscount";

// The custom plan's trial is set in /admin/plans (SyncState, not a catalog
// column — see lib/customPlanConfig for why) and read per request.

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isStripeEnabled()) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 503 });
  }

  // `customPages` arrives in the body for symmetry with the client, but it is
  // NOT read: the selection that gets priced is the one stored with the intent.
  const { token, planSlug, interval } = await req.json().catch(() => ({}));
  if (!token || !planSlug || !interval) {
    return NextResponse.json(
      { error: "token, planSlug and interval are required." },
      { status: 400 },
    );
  }
  if (interval !== "MONTH" && interval !== "YEAR") {
    return NextResponse.json({ error: "interval must be MONTH or YEAR." }, { status: 400 });
  }

  const pending = await readPendingSignup(String(token));
  if (!pending) {
    return NextResponse.json({ error: "That signup expired. Start again." }, { status: 410 });
  }

  /* THE CUSTOM PLAN has no catalog row and no Stripe price: its amount is the
     base plus the pages the shop ticked. It is priced HERE, from the selection
     stored with the pending intent — never from the request body — and sent to
     Stripe as an inline `price_data` line. */
  const isCustom = String(planSlug) === CUSTOM_PLAN_SLUG;

  // Stripe's own line-item type: `price` for a catalog plan, `price_data` for
  // the custom one.
  let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;
  let trialDays = 0;
  let planLabel = String(planSlug);

  // Mode-aware from the top: the admin's live/sandbox switch (lib/stripeMode)
  // decides which account this session is created on, and only the LIVE path
  // requires a PlanPrice mirror — the sandbox has no such ids, so test mode
  // prices inline from the catalog row.
  const { stripe, mode } = await getStripeClient();

  if (isCustom) {
    const pages = pending.customPages;
    const amount = customPriceCents(pages, interval);
    trialDays = await getCustomPlanTrialDays();
    planLabel = CUSTOM_PLAN_SLUG;
    /* A REUSED price, not inline price_data: inline data mints a fresh
       Product+Price per checkout and would litter the Stripe dashboard with a
       product per signup. The custom price space is tiny ($20 + $10 × 0–9
       pages), so lib/stripePriceCache keeps ONE "JobFlex Custom" product per
       account and reuses a price per distinct amount. */
    lineItem = {
      price: await ensureRecurringPrice({
        stripe,
        mode,
        kind: "custom",
        name: "JobFlex Custom plan",
        interval,
        cents: amount,
      }),
      quantity: 1,
    };
  } else {
    const plan = await getPlanBySlug(String(planSlug));
    if (!plan || !plan.active || plan.isFree) {
      return NextResponse.json({ error: "That plan is not available." }, { status: 404 });
    }
    trialDays = plan.trialDays;
    planLabel = plan.slug;
    if (mode === "live") {
      const price = await db.planPrice.findFirst({
        where: { planSlug: plan.slug, interval, active: true },
      });
      if (!price) {
        return NextResponse.json({ error: "That plan isn't available for checkout yet." }, { status: 404 });
      }
      lineItem = { price: price.stripePriceId, quantity: 1 };
    } else {
      const cents = interval === "YEAR" ? (plan.yearlyPriceCents ?? 0) : plan.priceCents;
      if (cents <= 0) {
        return NextResponse.json({ error: "That plan is not available." }, { status: 404 });
      }
      // Sandbox: same reuse as the custom plan — one product per plan slug on
      // the test account, one price per amount, no per-checkout clutter.
      lineItem = {
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
    }
  }

  /* THE CODE TYPED ON THE PLAN STEP IS APPLIED HERE — for real, this time.
     Until 2026-09-02 this only opened Stripe's own promo field, so "code
     applied" on our page met a full price on Stripe's (owner's report). The
     validated code rides with the pending intent: an influencer promo becomes
     its Stripe promotion code; a member referral becomes the referral coupon
     (lib/referralDiscount). `discounts` and `allow_promotion_codes` are
     mutually exclusive at Stripe, so a session with a discount attached has no
     promo field.

     THE MODE GATE THAT USED TO BE HERE. `&& mode === "live"` made this branch a
     no-op in the sandbox, because the stored promo_… ids belong to the live
     account and passing one to a test session 400s the whole checkout. True,
     but the remedy reproduced the 2026-09-02 defect in test mode: the plan step
     promises "20% off · $63.20" and Stripe charges $79. lib/influencerPromoMode
     resolves the id per mode instead — the stored one on live, byte for byte,
     and a cached test twin in the sandbox. */
  let discounts: Stripe.Checkout.SessionCreateParams.Discount[] | null = null;
  const attr = pending.attribution;
  if (attr?.kind === "promo") {
    const v = await validateAttribution("promo", attr.code);
    if (v?.kind === "promo") {
      const promotionCode = await promotionCodeIdForMode(stripe, mode, {
        id: v.promoId,
        code: v.code,
        stripeCouponId: v.stripeCouponId,
        stripePromotionCodeId: v.stripePromotionCodeId,
        customerPercentOff: v.percentOff,
      });
      if (promotionCode) discounts = [{ promotion_code: promotionCode }];
      // Never silently: the plan step has already shown this visitor a price
      // with the discount in it, so a drop here is a promise being broken and
      // the operator must be able to find out why.
      else console.warn(`[checkout/signup] promo ${v.code} is not applicable in ${mode} mode`);
    }
  } else if (attr?.kind === "ref") {
    const v = await validateAttribution("ref", attr.code);
    if (v) {
      try {
        discounts = [
          { coupon: await ensureReferralCoupon(stripe, mode, referralCouponMonths(trialDays)) },
        ];
      } catch (err) {
        console.warn("[checkout/signup] referral coupon unavailable:", err);
      }
    }
  }

  const origin = new URL(req.url).origin;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: pending.email,
      client_reference_id: String(token),
      line_items: [lineItem],
      subscription_data: trialDays > 0 ? { trial_period_days: trialDays } : undefined,
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      metadata: {
        signupToken: String(token),
        planSlug: planLabel,
        interval,
        ...(isCustom ? { customPages: pending.customPages.join(",") } : {}),
      },
      success_url: `${origin}/auth/register?signup=${encodeURIComponent(String(token))}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/auth/register?signup=${encodeURIComponent(String(token))}&checkout=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[checkout/signup] failed:", err);
    return NextResponse.json({ error: "Couldn't open checkout." }, { status: 502 });
  }
}
