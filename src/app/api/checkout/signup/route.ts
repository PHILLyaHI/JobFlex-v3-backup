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
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { readPendingSignup } from "@/actions/signupCheckout";
import { resolveSignupDiscount, resolveSignupPrice } from "@/lib/signupPricing";
import { trialRequiresCard } from "@/lib/trialPolicy";
import { cardlessTrialsPaused } from "@/lib/trialDailyCap";
import { CUSTOM_PLAN_OFF_SALE, customPlanOffered } from "@/lib/customPlanFlag";
import { CUSTOM_PLAN_SLUG } from "@/lib/customPlan";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // The card checkout is the TRIAL_REQUIRES_CARD=true path; with the flag off
  // the plan step starts the card-less trial instead (lib/cardlessTrial) —
  // unless the day's card-less ceiling is reached (lib/trialDailyCap), when
  // the trial takes a card here exactly as with the flag on.
  if (!trialRequiresCard() && !(await cardlessTrialsPaused())) {
    return NextResponse.json({ error: "Start the free trial from the plan step." }, { status: 409 });
  }
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

  // Off sale (CUSTOM_PLAN_ENABLED unset): a new shop cannot start on it.
  if (String(planSlug) === CUSTOM_PLAN_SLUG && !customPlanOffered()) {
    return NextResponse.json({ error: CUSTOM_PLAN_OFF_SALE }, { status: 410 });
  }

  const pending = await readPendingSignup(String(token));
  if (!pending) {
    return NextResponse.json({ error: "That signup expired. Start again." }, { status: 410 });
  }

  // Mode-aware from the top: the admin's live/sandbox switch (lib/stripeMode)
  // decides which account this session is created on. The price and the
  // discount are lib/signupPricing's — the card-less trial reads the same.
  const { stripe, mode } = await getStripeClient();
  const priced = await resolveSignupPrice({
    stripe,
    mode,
    planSlug: String(planSlug),
    interval,
    customPages: pending.customPages,
  });
  if (!priced.ok) return NextResponse.json({ error: priced.error }, { status: priced.status });
  const { trialDays, planLabel, isCustom } = priced;
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = { price: priced.price, quantity: 1 };
  const discount = await resolveSignupDiscount({ stripe, mode, attribution: pending.attribution, trialDays, where: "checkout/signup" });
  // `discounts` and `allow_promotion_codes` are mutually exclusive at Stripe,
  // so a session with a discount attached has no promo field.
  const discounts: Stripe.Checkout.SessionCreateParams.Discount[] | null = discount ? [discount] : null;

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
