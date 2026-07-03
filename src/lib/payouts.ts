// Server-only: execute approved payouts via Stripe Connect transfers.
// Called by the process-approved-payouts cron. Idempotent at two layers — the
// Stripe transfer idempotencyKey (one transfer per request) and the unique
// `pay:` ledger key (one PAID entry per transfer).

import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { isStripeWriteAllowed } from "@/lib/stripeSafety";
import { ledgerBalances } from "@/lib/commission";
import {
  PayoutRequestStatus,
  PayoutTransferStatus,
  LedgerEntryType,
  LedgerEntryState,
  ConnectStatus,
} from "@/lib/prismaEnums";

export async function runApprovedPayouts() {
  if (!isStripeEnabled()) return { skipped: "stripe-disabled", paid: 0, failed: 0 };
  // Real money movement — never auto-transfer against a live key without opt-in.
  if (!isStripeWriteAllowed()) return { skipped: "live-writes-disabled", paid: 0, failed: 0 };
  const stripe = getStripe();

  const requests = await db.payoutRequest.findMany({
    where: { status: PayoutRequestStatus.APPROVED },
    include: { influencer: true },
  });

  let paid = 0;
  let failed = 0;
  let notReady = 0;

  for (const reqRow of requests) {
    const inf = reqRow.influencer;
    if (!inf.connectAccountId || !inf.payoutsEnabled || inf.connectStatus !== ConnectStatus.ENABLED) {
      notReady++;
      continue; // wait until Connect onboarding completes
    }

    // Pay out the balance that is actually cleared right now (refunds may have
    // reduced it since approval). Never pay more than is on the books.
    const entries = await db.commissionLedger.findMany({
      where: { influencerId: inf.id },
      select: { entryType: true, amountCents: true, state: true },
    });
    const { clearedCents } = ledgerBalances(entries);
    const amount = clearedCents;
    if (amount <= 0) {
      await db.payoutRequest.update({
        where: { id: reqRow.id },
        data: { status: PayoutRequestStatus.FAILED, rejectedReason: "No cleared balance at payout time." },
      });
      failed++;
      continue;
    }

    await db.payoutRequest.update({ where: { id: reqRow.id }, data: { status: PayoutRequestStatus.PROCESSING } });

    const transferRow = await db.payoutTransfer.create({
      data: {
        influencerId: inf.id,
        payoutRequestId: reqRow.id,
        amountCents: amount,
        currency: inf.defaultCurrency,
        status: PayoutTransferStatus.PENDING,
        stripeConnectAccountId: inf.connectAccountId,
        idempotencyKey: `payout:${reqRow.id}`,
      },
    });

    try {
      const transfer = await stripe.transfers.create(
        {
          amount,
          currency: inf.defaultCurrency,
          destination: inf.connectAccountId,
          metadata: { influencerId: inf.id, payoutRequestId: reqRow.id },
        },
        { idempotencyKey: `payout:${reqRow.id}` },
      );

      // Atomically: move cleared entries out of the CLEARED bucket, record the
      // negative PAID entry, and close the request + transfer.
      await db.$transaction([
        db.commissionLedger.updateMany({
          where: { influencerId: inf.id, state: LedgerEntryState.CLEARED },
          data: { state: LedgerEntryState.PAID, payoutTransferId: transferRow.id },
        }),
        db.commissionLedger.create({
          data: {
            influencerId: inf.id,
            attributionId: null,
            entryType: LedgerEntryType.PAID,
            amountCents: -amount,
            currency: inf.defaultCurrency,
            state: LedgerEntryState.PAID,
            payoutTransferId: transferRow.id,
            idempotencyKey: `pay:${transfer.id}`,
            memo: `Payout transfer ${transfer.id}`,
          },
        }),
        db.payoutTransfer.update({
          where: { id: transferRow.id },
          data: { status: PayoutTransferStatus.PAID, stripeTransferId: transfer.id, paidAt: new Date() },
        }),
        db.payoutRequest.update({
          where: { id: reqRow.id },
          data: { status: PayoutRequestStatus.PAID, amountCents: amount },
        }),
      ]);
      paid++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "transfer failed";
      await db.payoutTransfer.update({
        where: { id: transferRow.id },
        data: { status: PayoutTransferStatus.FAILED, failureReason: msg.slice(0, 500) },
      });
      await db.payoutRequest.update({
        where: { id: reqRow.id },
        data: { status: PayoutRequestStatus.FAILED, rejectedReason: msg.slice(0, 500) },
      });
      failed++;
    }
  }

  return { paid, failed, notReady };
}
