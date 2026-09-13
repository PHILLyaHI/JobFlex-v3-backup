import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, isStripeEnabled, stripeClientForMode } from "@/lib/sdk/stripe";
import { runWebhookEnvelope } from "@/lib/webhookEnvelope";
import { dispatchStripeEvent } from "@/lib/payments/stripeEvents";

export const runtime = "nodejs";

// CONNECT endpoint — events from the contractors' OAuth-connected accounts
// (direct charges live there, not on the platform account). Registered in
// the Dashboard with "Listen to events on Connected accounts"; its own
// signing secret per mode. `event.account` is the acct_ the event belongs to.
// Key-joined accounts report to /api/webhooks/stripe-key/[id] instead; both
// feed lib/payments/stripeEvents.ts.
export async function POST(req: Request) {
  const secrets = [
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET_TEST,
  ].filter((s): s is string => Boolean(s));
  if (!isStripeEnabled() || secrets.length === 0) {
    return NextResponse.json({ disabled: true });
  }

  const sig = req.headers.get("stripe-signature") ?? "";
  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event | null = null;
  let lastErr = "bad signature";
  for (const secret of secrets) {
    try {
      event = stripe.webhooks.constructEvent(body, sig, secret);
      break;
    } catch (err: unknown) {
      lastErr = err instanceof Error ? err.message : lastErr;
    }
  }
  if (!event) {
    return NextResponse.json({ error: `Webhook signature: ${lastErr}` }, { status: 400 });
  }

  const evt = event;
  const account = evt.account ?? null;
  // Follow-up calls must hit the account's own mode, whatever the admin
  // switch says right now.
  const client = stripeClientForMode(evt.livemode ? "live" : "test") ?? stripe;
  const result = await runWebhookEnvelope(
    { provider: "STRIPE", eventId: evt.id, type: evt.type },
    () =>
      dispatchStripeEvent(evt, {
        via: "connect",
        stripe: client,
        reqOpts: account ? { stripeAccount: account } : {},
        account,
        organizationId: null,
      }),
  );
  if (result.outcome === "duplicate") return NextResponse.json({ duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ received: true });
}
