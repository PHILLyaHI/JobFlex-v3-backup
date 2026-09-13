// JobFlex's cut when the contractor joined Stripe with their OWN key: Stripe
// can't split that charge (no Connect), so the fee becomes an invoice item on
// the org's JobFlex subscription and rides on their next monthly invoice — the
// way Shopify bills third-party-gateway fees. No subscription customer (a
// hand-granted plan): the fee stays in the ledger (Payment.feeAmount) with
// feeInvoiceItemId null, for the operator to collect by hand.
import { db } from "@/lib/db";
import { getStripeMode } from "@/lib/stripeMode";
import { stripeClientForMode } from "@/lib/sdk/stripe";

export type FeeBillingOutcome = "billed" | "already" | "no_customer" | "no_platform" | "failed";

export async function billPlatformFee(input: {
  paymentId: string;
  organizationId: string;
  feeMinor: number;
  currency: string;
  description: string;
}): Promise<FeeBillingOutcome> {
  if (input.feeMinor <= 0) return "no_customer";
  const [payment, sub] = await Promise.all([
    db.payment.findUnique({ where: { id: input.paymentId }, select: { feeInvoiceItemId: true } }),
    db.subscription.findUnique({
      where: { organizationId: input.organizationId },
      select: { externalCustomerId: true, provider: true },
    }),
  ]);
  if (!payment) return "failed";
  if (payment.feeInvoiceItemId) return "already";
  const customer = sub?.provider === "STRIPE" ? sub.externalCustomerId : null;
  if (!customer) return "no_customer";

  // The customer lives in whichever mode created the subscription; try the
  // admin-selected mode first, then the other one.
  const mode = await getStripeMode();
  const clients = [stripeClientForMode(mode), stripeClientForMode(mode === "live" ? "test" : "live")].filter(
    (c): c is NonNullable<typeof c> => c !== null,
  );
  if (!clients.length) return "no_platform";

  for (const stripe of clients) {
    try {
      const item = await stripe.invoiceItems.create(
        {
          customer,
          amount: input.feeMinor,
          currency: input.currency.toLowerCase(),
          description: input.description,
          metadata: { kind: "platform_fee", paymentId: input.paymentId, organizationId: input.organizationId },
        },
        { idempotencyKey: `fee:${input.paymentId}` },
      );
      await db.payment.update({ where: { id: input.paymentId }, data: { feeInvoiceItemId: item.id } });
      return "billed";
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "resource_missing") continue; // not this mode's customer
      console.warn("[feeBilling] invoice item failed", input.paymentId, err instanceof Error ? err.message : err);
      return "failed";
    }
  }
  return "no_customer";
}
