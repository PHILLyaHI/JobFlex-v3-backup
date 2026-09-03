import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled, stripeClientForMode } from "@/lib/sdk/stripe";
import { runWebhookEnvelope } from "@/lib/webhookEnvelope";
import { handleConnectAccountUpdate } from "@/lib/stripeSync";
import { InstallmentStatus, PaymentConnectionStatus } from "@/lib/prismaEnums";
import { settleInstallmentPayment, recordRefund } from "@/lib/payments/settle";
import { markConnectionRevoked } from "@/lib/payments/connections";
import { notifyPaymentIssue } from "@/lib/notify";

export const runtime = "nodejs";

// CONNECT endpoint — events from the contractors' connected accounts
// (direct charges live there, not on the platform account). Registered in
// the Dashboard with "Listen to events on Connected accounts"; its own
// signing secret per mode. `event.account` is the acct_ the event belongs to.
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
  const result = await runWebhookEnvelope(
    { provider: "STRIPE", eventId: evt.id, type: evt.type },
    () => dispatch(evt),
  );
  if (result.outcome === "duplicate") return NextResponse.json({ duplicate: true });
  if (result.outcome === "failed") return NextResponse.json({ error: result.error }, { status: 500 });
  return NextResponse.json({ received: true });
}

async function dispatch(event: Stripe.Event) {
  const account = event.account ?? null;
  // Follow-up calls must hit the account's own mode, whatever the admin
  // switch says right now.
  const stripe = stripeClientForMode(event.livemode ? "live" : "test") ?? getStripe();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.metadata?.kind) return; // not one of ours
      if (session.payment_status !== "paid") {
        // ACH / delayed methods: leave the stage PENDING until the async event.
        await db.installment.updateMany({
          where: { checkoutRef: session.id, status: InstallmentStatus.PENDING },
          data: { checkoutOpenedAt: new Date() }, // keeps it out of the stale sweep
        });
        return;
      }
      await settleFromSession(stripe, account, session);
      return;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.metadata?.kind) return;
      await releaseSession(session.id);
      const orgId = session.metadata.organizationId;
      if (orgId) {
        await notifyPaymentIssue({
          organizationId: orgId,
          proposalId: session.metadata.proposalId ?? null,
          title: "A bank payment failed",
          detail: "The client's bank debit didn't go through. The stage is open again so they can try another method.",
          amount: (session.amount_total ?? 0) / 100,
        });
      }
      return;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!session.metadata?.kind) return;
      await releaseSession(session.id);
      return;
    }
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (!pi) return;
      await recordRefund({
        provider: "STRIPE",
        externalPaymentId: pi,
        refundedMinor: charge.amount_refunded,
        full: Boolean(charge.refunded),
      });
      return;
    }
    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      const conn = await db.paymentConnection.findFirst({ where: { stripeAccountId: acct.id } });
      if (!conn) {
        await handleConnectAccountUpdate(acct); // influencer Express payouts
        return;
      }
      const charges = Boolean(acct.charges_enabled);
      const wasEnabled = conn.stripeChargesEnabled;
      await db.paymentConnection.update({
        where: { id: conn.id },
        data: {
          stripeChargesEnabled: charges,
          stripeDetailsSubmitted: Boolean(acct.details_submitted),
          currency: acct.default_currency ? acct.default_currency.toUpperCase() : conn.currency,
          country: acct.country ?? conn.country,
          status:
            conn.status === PaymentConnectionStatus.REVOKED
              ? conn.status
              : charges
                ? PaymentConnectionStatus.ACTIVE
                : PaymentConnectionStatus.RESTRICTED,
          lastError: charges ? null : (acct.requirements?.disabled_reason ?? "Charges disabled"),
        },
      });
      if (wasEnabled && !charges) {
        await notifyPaymentIssue({
          organizationId: conn.organizationId,
          title: "Stripe paused payments on your account",
          detail: `Stripe reports: ${acct.requirements?.disabled_reason ?? "charges disabled"}. Clients can't pay by card until it's resolved in your Stripe dashboard.`,
        });
      }
      return;
    }
    case "account.application.deauthorized": {
      if (!account) return;
      const conn = await db.paymentConnection.findFirst({ where: { stripeAccountId: account } });
      if (!conn) return;
      await markConnectionRevoked(conn.organizationId, "STRIPE", "Disconnected from the Stripe dashboard");
      await notifyPaymentIssue({
        organizationId: conn.organizationId,
        title: "Stripe was disconnected",
        detail: "JobFlex was removed from your Stripe account. Reconnect it in Settings → Payments to take card payments again.",
      });
      return;
    }
    default:
      return;
  }
}

async function settleFromSession(stripe: Stripe, account: string | null, session: Stripe.Checkout.Session) {
  const m = session.metadata ?? {};
  let pi: Stripe.PaymentIntent | null = null;
  let method = "card";
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (piId) {
    try {
      pi = await stripe.paymentIntents.retrieve(
        piId,
        { expand: ["latest_charge"] },
        account ? { stripeAccount: account } : undefined,
      );
      const charge = pi.latest_charge as Stripe.Charge | null;
      method = charge?.payment_method_details?.type ?? "card";
    } catch (err) {
      console.warn("[stripe-connect] PI retrieve failed", piId, err instanceof Error ? err.message : err);
    }
  }
  await settleInstallmentPayment({
    provider: "STRIPE",
    externalId: session.id,
    externalPaymentId: piId ?? null,
    organizationId: m.organizationId ?? "",
    proposalId: m.proposalId ?? null,
    installmentIds: (m.installmentIds ?? "").split(",").filter(Boolean),
    amountMinor: session.amount_total ?? 0,
    feeMinor: pi?.application_fee_amount ?? 0,
    currency: (session.currency ?? "usd").toUpperCase(),
    livemode: Boolean(session.livemode),
    method,
    scheduleVersion: m.scheduleVersion ? Number(m.scheduleVersion) : null,
  });
}

async function releaseSession(sessionId: string) {
  await db.installment.updateMany({
    where: { checkoutRef: sessionId, status: InstallmentStatus.PENDING },
    data: {
      status: InstallmentStatus.UNPAID,
      checkoutProvider: null,
      checkoutRef: null,
      checkoutOrderId: null,
      checkoutOpenedAt: null,
    },
  });
}
