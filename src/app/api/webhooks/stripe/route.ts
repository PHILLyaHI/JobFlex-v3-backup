import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { WebhookEventStatus } from "@/lib/prismaEnums";
import {
  syncSubscriptionFromStripe,
  markSubscriptionCanceled,
  markSubscriptionPastDue,
  accrueForInvoice,
  reverseForCharge,
  handleConnectAccountUpdate,
  handleTransferEvent,
} from "@/lib/stripeSync";
import { processReferralEffectsForInvoice } from "@/lib/referralRewards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isStripeEnabled() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ disabled: true });
  }

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "bad signature";
    return NextResponse.json({ error: `Webhook signature: ${msg}` }, { status: 400 });
  }

  // Idempotency envelope: the unique eventId drops duplicate deliveries before
  // any side effect runs. A second delivery of the same event short-circuits here.
  try {
    await db.webhookEvent.create({
      data: { eventId: event.id, type: event.type, status: WebhookEventStatus.RECEIVED },
    });
  } catch {
    return NextResponse.json({ duplicate: true });
  }

  try {
    await dispatch(event, stripe);
    await db.webhookEvent.update({
      where: { eventId: event.id },
      data: { status: WebhookEventStatus.PROCESSED, processedAt: new Date() },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "handler error";
    await db.webhookEvent.update({
      where: { eventId: event.id },
      data: { status: WebhookEventStatus.FAILED, error: msg.slice(0, 1000) },
    });
    // 500 so Stripe retries; the idempotency keys make re-processing safe.
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function dispatch(event: Stripe.Event, stripe: Stripe) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string" ? session.subscription : session.subscription.id,
        );
        await syncSubscriptionFromStripe(sub);
      } else {
        await handleProposalPayment(session); // existing one-time proposal payment flow
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await syncSubscriptionFromStripe(event.data.object as Stripe.Subscription);
      break;
    }
    case "customer.subscription.deleted": {
      await markSubscriptionCanceled(event.data.object as Stripe.Subscription);
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      await accrueForInvoice(invoice, event.id);
      // Member-referral side: convert PENDING referrals on the referred org's
      // first real payment + apply owed 50%-of-a-month referrer credits.
      await processReferralEffectsForInvoice(invoice);
      break;
    }
    case "invoice.payment_failed": {
      await markSubscriptionPastDue(event.data.object as Stripe.Invoice);
      break;
    }
    case "charge.refunded": {
      await reverseForCharge(event.data.object as Stripe.Charge, event.id);
      break;
    }
    case "account.updated": {
      await handleConnectAccountUpdate(event.data.object as Stripe.Account);
      break;
    }
    case "transfer.created": {
      await handleTransferEvent(event.data.object as Stripe.Transfer, false);
      break;
    }
    case "transfer.reversed": {
      await handleTransferEvent(event.data.object as Stripe.Transfer, true);
      break;
    }
    default:
      break;
  }
}

// One-time proposal payments. The Payment row always records the true amount
// that arrived, but the proposal only flips to PAID when the full expected
// total was actually paid — defense-in-depth against a checkout session created
// for a tampered amount (the checkout routes already derive the amount
// server-side, so a shortfall should only ever come from an out-of-band session).
async function handleProposalPayment(session: Stripe.Checkout.Session) {
  const publicId = session.metadata?.publicId;
  if (!publicId) return;
  const proposal = await db.proposal.findUnique({ where: { publicId } });
  if (!proposal) return;

  const expected = Math.round(proposal.total * 100);
  const paid = session.amount_total ?? 0;
  const fullyPaid = paid >= expected;

  await db.payment.create({
    data: {
      organizationId: proposal.organizationId,
      proposalId: proposal.id,
      clientId: proposal.clientId,
      amount: paid / 100,
      currency: (session.currency ?? "usd").toUpperCase(),
      provider: "STRIPE",
      status: fullyPaid ? "PAID" : "PARTIAL",
      externalId: session.id,
      method: "card",
      paidAt: new Date(),
    },
  });

  if (fullyPaid) {
    await db.proposal.update({
      where: { id: proposal.id },
      data: { status: "PAID", paidAt: new Date() },
    });
  } else {
    // Underpaid — leave the proposal unpaid and surface it for manual review
    // rather than silently marking a $12k quote PAID for a few cents.
    console.warn(
      `[stripe] proposal ${proposal.id} underpaid: got ${paid} of ${expected} (${session.id}) — not marking PAID`,
    );
  }
}
