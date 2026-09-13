// One Stripe event pipeline for both ways a contractor joins:
//   /api/webhooks/stripe-connect    the platform's Connect endpoint (`event.account`)
//   /api/webhooks/stripe-key/[id]   the endpoint registered on a key-joined account
// The route verifies the signature and owns the dedupe envelope; this module
// turns a verified event into settle / release / refund / status writes.
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { InstallmentStatus, PaymentConnectionStatus } from "@/lib/prismaEnums";
import { settleInstallmentPayment, recordRefund } from "./settle";
import { markConnectionRevoked } from "./connections";
import { notifyPaymentIssue } from "@/lib/notify";
import { handleConnectAccountUpdate } from "@/lib/stripeSync";

export interface StripeEventContext {
  /** Which endpoint delivered it. */
  via: "connect" | "key";
  /** Client for follow-up reads, already on the right mode / key. */
  stripe: Stripe;
  /** The Stripe-Account header for a Connect event; nothing for a key one. */
  reqOpts: Stripe.RequestOptions;
  /** The account the event belongs to (acct_…), when known. */
  account: string | null;
  /** The org this endpoint may settle for (known up front on a key
   *  endpoint; looked up from `account` on the Connect one). A session whose
   *  metadata names another org is ignored — a contractor can mint sessions
   *  on their own account with any metadata they like. */
  organizationId: string | null;
}

/** OAuth: the application fee Stripe took inside the charge. Key: the fee we
 *  computed at checkout, carried in metadata (nothing was taken). */
export function feeMinorOf(pi: Stripe.PaymentIntent | null, session: Stripe.Checkout.Session): number {
  const fromPi = pi?.application_fee_amount;
  if (typeof fromPi === "number") return fromPi;
  const fromMeta = Number(session.metadata?.platformFeeMinor ?? 0);
  return Number.isFinite(fromMeta) && fromMeta > 0 ? Math.round(fromMeta) : 0;
}

export function feeBillingOf(session: Stripe.Checkout.Session): "in_payment" | "invoice" {
  return session.metadata?.feeBilling === "invoice" ? "invoice" : "in_payment";
}

export async function dispatchStripeEvent(event: Stripe.Event, ctx: StripeEventContext): Promise<void> {
  const account = ctx.account;
  const expectedOrg =
    ctx.organizationId ??
    (account
      ? ((await db.paymentConnection.findFirst({ where: { stripeAccountId: account }, select: { organizationId: true } }))
          ?.organizationId ?? null)
      : null);
  const ours = (session: Stripe.Checkout.Session) =>
    Boolean(session.metadata?.kind) && expectedOrg !== null && session.metadata?.organizationId === expectedOrg;

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!ours(session)) return; // not one of ours, or not this account's org
      if (session.payment_status !== "paid") {
        // ACH / delayed methods: leave the stage PENDING until the async event.
        await db.installment.updateMany({
          where: { checkoutRef: session.id, status: InstallmentStatus.PENDING },
          data: { checkoutOpenedAt: new Date() }, // keeps it out of the stale sweep
        });
        return;
      }
      await settleFromSession(ctx, session);
      return;
    }
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!ours(session)) return;
      await releaseSession(session.id);
      const orgId = session.metadata?.organizationId;
      if (orgId) {
        await notifyPaymentIssue({
          organizationId: orgId,
          proposalId: session.metadata?.proposalId ?? null,
          title: "A bank payment failed",
          detail: "The client's bank debit didn't go through. The stage is open again so they can try another method.",
          amount: (session.amount_total ?? 0) / 100,
        });
      }
      return;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!ours(session)) return;
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
      const conn = await db.paymentConnection.findFirst({
        where: { stripeAccountId: acct.id, ...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}) },
      });
      if (!conn) {
        if (ctx.via === "connect") await handleConnectAccountUpdate(acct); // influencer Express payouts
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
      if (ctx.via !== "connect" || !account) return;
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

async function settleFromSession(ctx: StripeEventContext, session: Stripe.Checkout.Session) {
  const m = session.metadata ?? {};
  let pi: Stripe.PaymentIntent | null = null;
  let method = "card";
  const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (piId) {
    try {
      pi = await ctx.stripe.paymentIntents.retrieve(piId, { expand: ["latest_charge"] }, ctx.reqOpts);
      const charge = pi.latest_charge as Stripe.Charge | null;
      method = charge?.payment_method_details?.type ?? "card";
    } catch (err) {
      console.warn(`[stripe-${ctx.via}] PI retrieve failed`, piId, err instanceof Error ? err.message : err);
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
    feeMinor: feeMinorOf(pi, session),
    feeBilling: feeBillingOf(session),
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
