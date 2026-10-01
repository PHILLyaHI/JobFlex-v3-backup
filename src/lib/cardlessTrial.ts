// THE CARD-LESS TRIAL, STRIPE SIDE (owner, 2026-10-01; TRIAL_REQUIRES_CARD
// unset or false — lib/trialPolicy).
//
// START. The plan step asks for no card. When the signup is finished
// (completeCardlessSignup) a Stripe customer and a subscription on the chosen
// plan are created at once, with:
//   · trial_period_days = 7 (CARDLESS_TRIAL_DAYS, whatever the plan's own
//     trial says);
//   · no payment method, and trial_settings.end_behavior.missing_payment_method
//     = "cancel" — a trial nobody added a card to simply ends; nothing is ever
//     attempted on a card that does not exist;
//   · metadata.jf_cardless = "1", which is how the webhook and the reconcile
//     cron tell that ending from a customer leaving (lib/stripeSync,
//     isCardlessTrialLapse → TRIAL_ENDED).
//
// ADD A CARD, DURING THE TRIAL. Stripe Checkout in SETUP mode on the same
// customer: the card is saved, made the customer's and the subscription's
// default, and the trial converts to the paid plan on its own on day 8.
//
// ADD A CARD, AFTER IT ENDED. The ended subscription cannot be resumed
// (end_behavior "cancel" deletes it), so Checkout in SUBSCRIPTION mode on the
// same customer and the same plan and pages, with no second trial: the first
// charge is taken there and the workspace unlocks as the mirror turns ACTIVE.
import "server-only";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/sdk/stripe";
import { resolveSignupDiscount, resolveSignupPrice, type SignupInterval } from "@/lib/signupPricing";
import { CARDLESS_TRIAL_DAYS } from "@/lib/trialPolicy";
import { cardlessTrialState, patchCardlessRecord, readCardlessRecord, type CardlessRecord } from "@/lib/trialState";
import { syncSubscriptionFromStripe } from "@/lib/stripeSync";
import { CUSTOM_PLAN_SLUG, customPriceCents } from "@/lib/customPlan";
import { getPlanBySlug } from "@/lib/planCatalogServer";

export type CardlessStart =
  | {
      ok: true;
      subscription: Stripe.Subscription;
      customerId: string;
      planLabel: string;
      interval: SignupInterval;
      customPages: string[];
      mode: "live" | "test";
    }
  | { ok: false; error: string };

/**
 * Customer + trialing subscription, no payment method. Idempotent per signup
 * token (Stripe idempotency keys), so a retried confirmation never opens a
 * second subscription.
 */
export async function createCardlessSubscription(opts: {
  token: string;
  email: string;
  businessName: string;
  planSlug: string;
  interval: SignupInterval;
  customPages: string[];
  attribution: { kind: "promo" | "ref"; code: string } | null;
}): Promise<CardlessStart> {
  const { stripe, mode } = await getStripeClient();
  const priced = await resolveSignupPrice({
    stripe,
    mode,
    planSlug: opts.planSlug,
    interval: opts.interval,
    customPages: opts.customPages,
  });
  if (!priced.ok) return { ok: false, error: priced.error };
  const discount = await resolveSignupDiscount({
    stripe,
    mode,
    attribution: opts.attribution,
    trialDays: CARDLESS_TRIAL_DAYS,
    where: "cardless-trial",
  });
  const meta: Record<string, string> = {
    signupToken: opts.token,
    planSlug: priced.planLabel,
    interval: opts.interval,
    jf_cardless: "1",
    ...(priced.isCustom ? { customPages: opts.customPages.join(",") } : {}),
  };
  try {
    const customer = await stripe.customers.create(
      { email: opts.email, name: opts.businessName, metadata: { signupToken: opts.token, jf_cardless: "1" } },
      { idempotencyKey: `cardless-customer:${opts.token}` },
    );
    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: priced.price }],
        trial_period_days: CARDLESS_TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
        // A card added later through Checkout becomes the subscription's own.
        payment_settings: { save_default_payment_method: "on_subscription" },
        metadata: meta,
        ...(discount && "promotion_code" in discount ? { promotion_code: discount.promotion_code } : {}),
        ...(discount && "coupon" in discount ? { coupon: discount.coupon } : {}),
      },
      { idempotencyKey: `cardless-subscription:${opts.token}` },
    );
    return {
      ok: true,
      subscription,
      customerId: customer.id,
      planLabel: priced.planLabel,
      interval: opts.interval,
      customPages: priced.isCustom ? opts.customPages : [],
      mode,
    };
  } catch (err) {
    console.error("[cardless-trial] Stripe refused the trial:", err);
    return { ok: false, error: "Couldn't start the trial. Try again in a minute." };
  }
}

/** Once the organization exists: name it on the subscription (the webhook's
 *  first way to map it) — best-effort, the mirror row maps it anyway. */
export async function nameOrgOnSubscription(subId: string, orgId: string): Promise<void> {
  try {
    const { stripe } = await getStripeClient();
    await stripe.subscriptions.update(subId, { metadata: { organizationId: orgId } });
    await stripe.customers.update(
      (await stripe.subscriptions.retrieve(subId)).customer as string,
      { metadata: { organizationId: orgId } },
    );
  } catch (err) {
    console.warn("[cardless-trial] could not name the organization on Stripe:", err);
  }
}

/** The plan the trial runs on, as the screens print it. */
export async function trialPlanSummary(rec: CardlessRecord): Promise<{ name: string; cents: number; per: string }> {
  const per = rec.interval === "YEAR" ? "/yr" : "/mo";
  if (rec.planSlug === CUSTOM_PLAN_SLUG) {
    return { name: "Custom", cents: customPriceCents(rec.customPages, rec.interval), per };
  }
  const plan = await getPlanBySlug(rec.planSlug);
  const cents = rec.interval === "YEAR" ? (plan?.yearlyPriceCents ?? plan?.priceCents ?? 0) : (plan?.priceCents ?? 0);
  return { name: plan?.name ?? rec.planSlug, cents, per };
}

/**
 * The Checkout that adds the card: setup mode during the trial, subscription
 * mode (the same plan, no new trial) once it has ended. Null when there is
 * nothing to add a card to.
 */
export async function openCardCheckout(orgId: string, origin: string): Promise<{ url: string; purpose: "trial-card" | "trial-restart" } | null> {
  const state = await cardlessTrialState(orgId);
  if (!state || (state.kind === "trialing" && state.hasCard)) return null;
  const rec = state.record;
  const { stripe, mode } = await getStripeClient();
  const back = `${origin}/dashboard/trial`;
  if (state.kind === "trialing") {
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      currency: "usd",
      customer: rec.customerId,
      client_reference_id: orgId,
      metadata: { organizationId: orgId, jf_purpose: "trial-card", subscriptionId: rec.subId },
      setup_intent_data: { metadata: { organizationId: orgId, subscriptionId: rec.subId } },
      success_url: `${back}?card=added&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${back}?card=cancelled`,
    });
    if (!session.url) return null;
    return { url: session.url, purpose: "trial-card" };
  }
  const priced = await resolveSignupPrice({ stripe, mode, planSlug: rec.planSlug, interval: rec.interval, customPages: rec.customPages });
  if (!priced.ok) throw new Error(priced.error);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: rec.customerId,
    client_reference_id: orgId,
    line_items: [{ price: priced.price, quantity: 1 }],
    subscription_data: {
      metadata: {
        organizationId: orgId,
        planSlug: priced.planLabel,
        interval: rec.interval,
        jf_after_trial: "1",
        ...(priced.isCustom ? { customPages: rec.customPages.join(",") } : {}),
      },
    },
    metadata: { organizationId: orgId, jf_purpose: "trial-restart", planSlug: priced.planLabel },
    success_url: `${back}?card=added&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}?card=cancelled`,
  });
  if (!session.url) return null;
  return { url: session.url, purpose: "trial-restart" };
}

/**
 * A completed card Checkout, from the return URL or the webhook — whichever
 * comes first; both are safe to run twice. Setup mode: the card becomes the
 * customer's and the trial subscription's default. Subscription mode: the new
 * subscription is mirrored (ACTIVE) and the trial record is closed.
 */
export async function finishCardCheckout(
  orgId: string,
  sessionOrId: string | Stripe.Checkout.Session,
): Promise<{ ok: true; purpose: string } | { ok: false; error: string }> {
  const { stripe } = await getStripeClient();
  const session =
    typeof sessionOrId === "string"
      ? await stripe.checkout.sessions.retrieve(sessionOrId, { expand: ["setup_intent", "subscription"] })
      : sessionOrId;
  if (session.metadata?.organizationId !== orgId) return { ok: false, error: "That checkout is not this workspace's." };
  if (session.status !== "complete") return { ok: false, error: "The card was not added." };
  const rec = await readCardlessRecord(orgId);
  if (!rec) return { ok: false, error: "No trial to add a card to." };
  const purpose = session.metadata?.jf_purpose ?? "";

  if (purpose === "trial-card") {
    const si =
      typeof session.setup_intent === "string"
        ? await stripe.setupIntents.retrieve(session.setup_intent)
        : session.setup_intent;
    const pm = si && (typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id);
    if (!pm) return { ok: false, error: "The card was not saved." };
    await stripe.customers.update(rec.customerId, { invoice_settings: { default_payment_method: pm } });
    await stripe.subscriptions.update(rec.subId, { default_payment_method: pm });
    if (!rec.cardAt) await patchCardlessRecord(orgId, { cardAt: new Date().toISOString() });
    return { ok: true, purpose };
  }

  if (purpose === "trial-restart") {
    const sub =
      typeof session.subscription === "string"
        ? await stripe.subscriptions.retrieve(session.subscription)
        : session.subscription;
    if (!sub) return { ok: false, error: "The plan did not restart." };
    await syncSubscriptionFromStripe(sub);
    if (!rec.restartedAt) await patchCardlessRecord(orgId, { restartedAt: new Date().toISOString() });
    return { ok: true, purpose };
  }
  return { ok: false, error: "Unknown checkout." };
}
