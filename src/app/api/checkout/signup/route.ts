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
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { getPlanBySlug } from "@/lib/planCatalogServer";
import { readPendingSignup } from "@/actions/signupCheckout";
import { CUSTOM_PLAN_SLUG, customPriceCents } from "@/lib/customPlan";

/** The custom plan trials for the same fortnight the catalog plans do. */
const CUSTOM_TRIAL_DAYS = 14;

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

  if (isCustom) {
    const pages = pending.customPages;
    const amount = customPriceCents(pages, interval);
    trialDays = CUSTOM_TRIAL_DAYS;
    planLabel = CUSTOM_PLAN_SLUG;
    lineItem = {
      price_data: {
        currency: "usd",
        unit_amount: amount,
        recurring: { interval: interval === "YEAR" ? "year" : "month" },
        product_data: {
          name: `JobFlex Custom — ${pages.length} extra page${pages.length === 1 ? "" : "s"}`,
        },
      },
      quantity: 1,
    };
  } else {
    const plan = await getPlanBySlug(String(planSlug));
    if (!plan || !plan.active || plan.isFree) {
      return NextResponse.json({ error: "That plan is not available." }, { status: 404 });
    }
    const price = await db.planPrice.findFirst({
      where: { planSlug: plan.slug, interval, active: true },
    });
    if (!price) {
      return NextResponse.json({ error: "That plan isn't available for checkout yet." }, { status: 404 });
    }
    trialDays = plan.trialDays;
    planLabel = plan.slug;
    lineItem = { price: price.stripePriceId, quantity: 1 };
  }

  const origin = new URL(req.url).origin;
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: pending.email,
      client_reference_id: String(token),
      line_items: [lineItem],
      subscription_data: trialDays > 0 ? { trial_period_days: trialDays } : undefined,
      // A code typed on the plan step is applied here; Stripe's own field stays
      // open for anything else the customer holds.
      allow_promotion_codes: true,
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
