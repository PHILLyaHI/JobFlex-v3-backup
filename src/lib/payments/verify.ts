// Active verification: ask the provider whether a PENDING checkout was paid
// and settle it if so. Used by the portal's ?paid=1 poll (webhook slower than
// the redirect, or no webhook in local test mode) and by the reconcile cron.
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { InstallmentStatus } from "@/lib/prismaEnums";
import { getConnection } from "./connections";
import { stripeForConnection } from "./stripeConnect";
import { squareClientForConnection } from "./squareConnect";
import { settleInstallmentPayment, type SettleResult } from "./settle";

export type VerifyOutcome =
  | { state: "paid"; settle: SettleResult }
  | { state: "open" }
  | { state: "expired" }
  | { state: "unavailable" };

/** Verify ONE checkout reference (all stages sharing it) for a proposal. */
export async function verifyCheckoutRef(proposalId: string, checkoutRef: string): Promise<VerifyOutcome> {
  const stages = await db.installment.findMany({
    where: { proposalId, checkoutRef },
    include: { proposal: { select: { organizationId: true, scheduleVersion: true, currency: true, clientId: true } } },
  });
  if (!stages.length) return { state: "unavailable" };
  const provider = stages[0].checkoutProvider;
  const proposal = stages[0].proposal;
  if (stages.every((s) => s.status === InstallmentStatus.PAID)) {
    return { state: "paid", settle: { outcome: "duplicate", paymentId: stages[0].paymentId ?? "" } };
  }

  if (provider === "STRIPE") {
    const conn = await getConnection(proposal.organizationId, "STRIPE");
    const bound = conn ? stripeForConnection(conn) : null;
    if (!bound) return { state: "unavailable" };
    let session: Stripe.Checkout.Session;
    try {
      session = await bound.stripe.checkout.sessions.retrieve(
        checkoutRef,
        { expand: ["payment_intent", "payment_intent.latest_charge"] },
        { stripeAccount: bound.accountId },
      );
    } catch {
      return { state: "unavailable" };
    }
    if (session.payment_status === "paid") {
      const pi = session.payment_intent as Stripe.PaymentIntent | null;
      const charge = (pi?.latest_charge ?? null) as Stripe.Charge | null;
      const settle = await settleInstallmentPayment({
        provider: "STRIPE",
        externalId: session.id,
        externalPaymentId: pi?.id ?? null,
        organizationId: proposal.organizationId,
        proposalId,
        installmentIds: (session.metadata?.installmentIds ?? "").split(",").filter(Boolean),
        amountMinor: session.amount_total ?? 0,
        feeMinor: pi?.application_fee_amount ?? 0,
        currency: (session.currency ?? proposal.currency).toUpperCase(),
        livemode: Boolean(session.livemode),
        method: charge?.payment_method_details?.type ?? "card",
        scheduleVersion: session.metadata?.scheduleVersion ? Number(session.metadata.scheduleVersion) : null,
        clientId: proposal.clientId,
      });
      return { state: "paid", settle };
    }
    if (session.status === "expired") return { state: "expired" };
    return { state: "open" };
  }

  if (provider === "SQUARE") {
    const conn = await getConnection(proposal.organizationId, "SQUARE");
    const client = conn ? await squareClientForConnection(conn) : null;
    if (!client) return { state: "unavailable" };
    const orderId = stages[0].checkoutOrderId;
    if (!orderId) return { state: "unavailable" };
    try {
      const order = (await client.orders.get({ orderId })).order;
      const tenders = order?.tenders ?? [];
      for (const t of tenders) {
        if (!t.paymentId) continue;
        const p = (await client.payments.get({ paymentId: t.paymentId })).payment;
        if (p?.status === "COMPLETED") {
          const settle = await settleInstallmentPayment({
            provider: "SQUARE",
            externalId: orderId,
            externalPaymentId: p.id ?? null,
            organizationId: proposal.organizationId,
            proposalId,
            installmentIds: (order?.metadata?.installmentIds ?? "").split(",").filter(Boolean),
            amountMinor: Number(p.amountMoney?.amount ?? 0),
            feeMinor: Number(p.appFeeMoney?.amount ?? 0),
            currency: String(p.amountMoney?.currency ?? proposal.currency).toUpperCase(),
            livemode: conn?.squareEnv === "production",
            method: p.sourceType === "BANK_ACCOUNT" ? "us_bank_account" : "card",
            scheduleVersion: order?.metadata?.scheduleVersion ? Number(order.metadata.scheduleVersion) : null,
            clientId: proposal.clientId,
          });
          return { state: "paid", settle };
        }
      }
      if (order?.state === "CANCELED") return { state: "expired" };
      return { state: "open" };
    } catch {
      return { state: "unavailable" };
    }
  }
  return { state: "unavailable" };
}
