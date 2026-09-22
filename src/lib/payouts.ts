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

/* ── WHY A PAYOUT REQUEST IS REFUSED, IN WORDS ──────────────
 *
 * ONE wording, decided once. Before this the server action threw a string and
 * the button computed its own hint from a different set of conditions, so the
 * two could disagree — and the thrown one never arrived anyway: Next.js redacts
 * a thrown Server Action message in production (see the comments in
 * actions/ai.ts, actions/fenceEstimator.ts, actions/roofEstimator.ts), so a
 * partner clicking Request payout got Next's generic fault paragraph instead of
 * a reason. The caller returns this string in an envelope.
 *
 * The Connect check is new. Nothing looked at payoutsEnabled before the request
 * was created, so a partner with no bank account attached could file one that
 * runApprovedPayouts would silently count as "notReady" on every run, forever,
 * with no way for either side to learn why: the request blocks every later
 * request, and nothing in the portal or the admin page says what is wrong.
 */
export interface PayoutEligibility {
  payoutsEnabled: boolean;
  connectStatus: string;
  minPayoutCents: number;
  clearedCents: number;
  /** The status of an already-open request (PENDING/APPROVED/PROCESSING), else null. */
  openRequestStatus: string | null;
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The reason this partner cannot request a payout right now, or null if they can. */
export function payoutRequestRefusal(e: PayoutEligibility): string | null {
  if (e.openRequestStatus) {
    return e.openRequestStatus === PayoutRequestStatus.PENDING
      ? "You already have a payout request waiting for review. It will be released to your Stripe account once an admin approves it."
      : `Your payout request is ${e.openRequestStatus.toLowerCase()}. You can request the next one after it lands.`;
  }
  if (!e.payoutsEnabled || e.connectStatus !== ConnectStatus.ENABLED) {
    return e.connectStatus === ConnectStatus.NONE
      ? "Connect a Stripe account first — we have nowhere to send the money yet. You keep earning in the meantime."
      : "Finish your Stripe setup before requesting a payout. Stripe still needs something from you before it will accept a transfer.";
  }
  if (e.clearedCents < e.minPayoutCents) {
    return `You need ${usd(e.minPayoutCents)} cleared to request a payout — you have ${usd(e.clearedCents)}.`;
  }
  if (e.clearedCents <= 0) return "There is nothing cleared to pay out yet.";
  return null;
}

/* ── THE TRANSFER ARGUMENTS, BUILT WHERE THEY CAN BE READ ────
 *
 * The one call in this codebase that moves real money to someone outside it.
 * Built here rather than inline at the call site so the exact params and options
 * can be asserted — amount in integer cents, the destination account, the
 * one-per-request idempotency key, both ids in metadata for reconciliation —
 * without anything reaching Stripe. scripts/qa/influencer-payout.check.ts prints
 * and checks them; runApprovedPayouts hands the same object to the SDK.
 */
export function transferArgsFor(
  inf: { id: string; connectAccountId: string; defaultCurrency: string },
  reqRow: { id: string },
  amountCents: number,
) {
  return {
    params: {
      amount: amountCents,
      currency: inf.defaultCurrency,
      destination: inf.connectAccountId,
      metadata: { influencerId: inf.id, payoutRequestId: reqRow.id },
    },
    // One transfer per payout request, whatever retries Stripe or we do.
    options: { idempotencyKey: `payout:${reqRow.id}` },
  };
}

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

    const args = transferArgsFor(
      { id: inf.id, connectAccountId: inf.connectAccountId, defaultCurrency: inf.defaultCurrency },
      reqRow,
      amount,
    );

    const transferRow = await db.payoutTransfer.create({
      data: {
        influencerId: inf.id,
        payoutRequestId: reqRow.id,
        amountCents: amount,
        currency: inf.defaultCurrency,
        status: PayoutTransferStatus.PENDING,
        stripeConnectAccountId: inf.connectAccountId,
        idempotencyKey: args.options.idempotencyKey,
      },
    });

    try {
      const transfer = await stripe.transfers.create(args.params, args.options);

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
