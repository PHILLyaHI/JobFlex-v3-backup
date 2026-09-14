// Settle the stages minted for a PAID Stax invoice — shared by the Stax
// webhook route (after re-reading the invoice with the merchant's key) and by
// verify.ts (the portal's active check + the reconcile cron). Stax takes no
// fee inside the payment, so the cut is the server's rate, billed on the
// JobFlex invoice.
import { db } from "@/lib/db";
import { InstallmentStatus } from "@/lib/prismaEnums";
import { platformFeeMinor } from "@/lib/paymentSchedule";
import { platformFeeBps } from "./fees";
import { settleInstallmentPayment, type SettleResult } from "./settle";
import { staxChargeOf, staxMethodWord, type StaxInvoice } from "./stax";

export type StaxSettleOutcome =
  | { state: "paid"; settle: SettleResult }
  | { state: "open" }
  | { state: "unknown" };

export async function settleStaxInvoice(organizationId: string, inv: StaxInvoice): Promise<StaxSettleOutcome> {
  if (inv.status !== "PAID") return { state: "open" };
  const stages = await db.installment.findMany({
    where: { checkoutProvider: "STAX", checkoutRef: inv.id },
    select: {
      id: true,
      status: true,
      paymentId: true,
      proposalId: true,
      proposal: { select: { organizationId: true, clientId: true, currency: true } },
    },
  });
  if (!stages.length) return { state: "unknown" };
  const proposal = stages[0].proposal;
  // The invoice must have been minted for the org this merchant's row belongs to.
  if (proposal.organizationId !== organizationId) {
    console.warn(`[stax] invoice ${inv.id} was not minted for this merchant's org — ignored`);
    return { state: "unknown" };
  }
  if (stages.every((s) => s.status === InstallmentStatus.PAID)) {
    return { state: "paid", settle: { outcome: "duplicate", paymentId: stages[0].paymentId ?? "" } };
  }
  const charge = staxChargeOf(inv);
  const amountMinor = Math.round(Number(inv.total_paid ?? inv.total ?? 0) * 100);
  const settle = await settleInstallmentPayment({
    provider: "STAX",
    externalId: inv.id,
    externalPaymentId: charge?.id ?? null,
    organizationId: proposal.organizationId,
    proposalId: stages[0].proposalId,
    installmentIds: stages.map((s) => s.id),
    amountMinor,
    feeMinor: platformFeeMinor(amountMinor, "STAX", platformFeeBps()),
    feeBilling: "invoice",
    currency: proposal.currency.toUpperCase(),
    livemode: true,
    method: staxMethodWord(charge?.method),
    scheduleVersion: null,
    clientId: proposal.clientId,
  });
  return { state: "paid", settle };
}
