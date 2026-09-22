// Server-only: execute approved payouts via Stripe Connect transfers.
// Called by the process-approved-payouts cron. Idempotent at three layers: the
// ledger rows are RESERVED to one transfer before money moves, the Stripe
// idempotencyKey is one per payout request, and the `pay:` ledger key is one PAID
// entry per transfer. See runApprovedPayouts for what each of those replaced.

import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { isStripeWriteAllowed } from "@/lib/stripeSafety";
import {
  PayoutRequestStatus,
  PayoutTransferStatus,
  LedgerEntryType,
  LedgerEntryState,
  ConnectStatus,
  InfluencerStatus,
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


/* ── RUNNING APPROVED PAYOUTS — EXACTLY ONCE, EXACTLY WHAT WAS APPROVED ──
 *
 * The one place real money leaves for someone outside the company, so every
 * step is built to be re-run safely. What it used to do, and why each changed:
 *
 *  · It paid `clearedCents` recomputed at run time, then marked EVERY row in
 *    state CLEARED as PAID with a predicate re-evaluated after the Stripe round
 *    trip. A row that cleared in between (the 06:00 clear cron, or a refund
 *    clawback written CLEARED on purpose so it nets into the next payout) was
 *    marked PAID without being paid — the partner lost it, or a clawback was
 *    lost. NOW the rows are RESERVED (payoutTransferId set, state still
 *    CLEARED) before any money moves, and only reserved rows are swept.
 *
 *  · It paid whatever was cleared, which could be more than the admin approved.
 *    NOW the reservation stops at the approved amount, oldest rows first; the
 *    rest stays CLEARED for the next payout. Negative rows (clawbacks) are
 *    always included — they only ever reduce what is owed.
 *
 *  · On ANY error it wrote the transfer and the request FAILED — including a
 *    timeout where Stripe had already sent the money. FAILED does not block a
 *    new request, the new request has a new id, so its idempotency key was one
 *    Stripe had never seen: the same money went out twice. NOW an outcome that
 *    is not a definite refusal is UNKNOWN, never FAILED: the request stays
 *    PROCESSING (which blocks new requests), and it is retried with the SAME
 *    key `payout:<requestId>`, so Stripe returns the original transfer instead
 *    of making a second one.
 *
 *  · The ledger transaction ran after the transfer inside the same catch, so a
 *    database hiccup after a successful transfer also became FAILED — money
 *    gone, books silent. NOW the Stripe transfer id is written onto the row the
 *    moment Stripe answers, before the books, and a transfer that has an id is
 *    never marked FAILED.
 *
 *  · A duplicate PayoutTransfer insert sat outside the try and killed the whole
 *    run. NOW the row is reused per request, and a request is claimed with a
 *    conditional status write so two overlapping runs cannot both take it.
 *
 *  · A suspended or terminated partner's approved request still transferred.
 *    NOW it does not.
 *
 * THE 24-HOUR EDGE. Stripe keeps an idempotency key for at least 24 hours, and
 * this cron runs daily — so retrying an unknown outcome on the NEXT run could
 * land just past expiry and pay twice. Unknown outcomes are therefore retried
 * within the same run, and a PROCESSING transfer older than RETRY_WINDOW_MS with
 * no Stripe id is NOT retried automatically: it is counted as `needsReview` and
 * shown on the Health page, for a person to check in the Stripe dashboard.
 */

const RETRY_WINDOW_MS = 20 * 60 * 60 * 1000; // inside Stripe's 24h key retention
const IN_RUN_ATTEMPTS = 3;

/** The one Stripe method this needs, so the loop can be driven by a stub. */
export interface TransferApi {
  create(
    params: ReturnType<typeof transferArgsFor>["params"],
    options: ReturnType<typeof transferArgsFor>["options"],
  ): Promise<{ id: string }>;
}

/**
 * A DEFINITE refusal: Stripe received the request and said no, so no money
 * moved and the reserved rows can be released. Everything else — a dropped
 * connection, a timeout, a 5xx, a rate limit, anything we cannot classify — is
 * UNKNOWN: the transfer may exist, so nothing is released and nothing is FAILED.
 */
function isDefiniteRefusal(err: unknown): boolean {
  const type = (err as { type?: string } | null)?.type ?? "";
  return (
    type === "StripeInvalidRequestError" ||
    type === "StripeCardError" ||
    type === "StripePermissionError" ||
    type === "StripeAuthenticationError" ||
    type === "StripeIdempotencyError"
  );
}

const errText = (e: unknown) =>
  (e instanceof Error ? e.message : String(e ?? "transfer failed")).slice(0, 500);

export async function runApprovedPayouts() {
  if (!isStripeEnabled()) {
    return { skipped: "stripe-disabled", paid: 0, failed: 0, notReady: 0, needsReview: 0 };
  }
  // Real money movement — never auto-transfer against a live key without opt-in.
  if (!isStripeWriteAllowed()) {
    return { skipped: "live-writes-disabled", paid: 0, failed: 0, notReady: 0, needsReview: 0 };
  }
  return processApprovedPayouts(getStripe().transfers);
}

/**
 * The loop itself, taking the transfers API as an argument so it can be driven
 * by a recording stub in scripts/qa without anything reaching Stripe. The only
 * production caller is runApprovedPayouts above, behind both guards.
 */
export async function processApprovedPayouts(transfers: TransferApi, now: Date = new Date()) {
  let paid = 0;
  let failed = 0;
  let notReady = 0;
  let needsReview = 0;

  const requests = await db.payoutRequest.findMany({
    where: { status: { in: [PayoutRequestStatus.APPROVED, PayoutRequestStatus.PROCESSING] } },
    include: { influencer: true },
    orderBy: { createdAt: "asc" },
  });

  for (const reqRow of requests) {
    const inf = reqRow.influencer;

    // ── 1. May this request be paid at all? ──
    const existing = await db.payoutTransfer.findUnique({
      where: { idempotencyKey: `payout:${reqRow.id}` },
    });

    if (!existing) {
      // Nothing has been sent for it yet, so it is still safe to decline.
      if (inf.status === InfluencerStatus.SUSPENDED || inf.status === InfluencerStatus.TERMINATED) {
        await db.payoutRequest.updateMany({
          where: {
            id: reqRow.id,
            status: { in: [PayoutRequestStatus.APPROVED, PayoutRequestStatus.PROCESSING] },
          },
          data: {
            status: PayoutRequestStatus.FAILED,
            rejectedReason: "Not paid: this partner account is suspended.",
          },
        });
        failed++;
        continue;
      }
      if (!inf.connectAccountId || !inf.payoutsEnabled || inf.connectStatus !== ConnectStatus.ENABLED) {
        notReady++;
        continue; // wait until Connect onboarding completes
      }
    } else if (existing.status === PayoutTransferStatus.PAID) {
      // Books already closed on an earlier run; make the request agree.
      await db.payoutRequest.updateMany({
        where: { id: reqRow.id, status: { not: PayoutRequestStatus.PAID } },
        data: { status: PayoutRequestStatus.PAID, amountCents: existing.amountCents },
      });
      continue;
    } else if (existing.status === PayoutTransferStatus.FAILED) {
      // A definite refusal already closed this; the request should say so too.
      continue;
    } else if (
      !existing.stripeTransferId &&
      now.getTime() - existing.createdAt.getTime() > RETRY_WINDOW_MS
    ) {
      // An unknown outcome older than Stripe's key retention: retrying could pay
      // twice. A person checks the Stripe dashboard (Health shows it).
      needsReview++;
      continue;
    }

    // ── 2. Claim the request, so an overlapping run cannot take it too. ──
    if (reqRow.status === PayoutRequestStatus.APPROVED) {
      const claimed = await db.payoutRequest.updateMany({
        where: { id: reqRow.id, status: PayoutRequestStatus.APPROVED },
        data: { status: PayoutRequestStatus.PROCESSING },
      });
      if (claimed.count === 0) continue; // another run got there first
    }

    // ── 3. Reserve the exact rows this transfer pays, before money moves. ──
    let transferRow = existing;
    if (!transferRow) {
      try {
        transferRow = await reserveRows(reqRow.id, inf, reqRow.amountCents);
      } catch (err) {
        // A unique clash on payout:<requestId> means an overlapping run reserved
        // it between our read and our write. Leave it to that run.
        if ((err as { code?: string }).code === "P2002") continue;
        throw err;
      }
      if (!transferRow) {
        await db.payoutRequest.update({
          where: { id: reqRow.id },
          data: { status: PayoutRequestStatus.FAILED, rejectedReason: "No cleared balance at payout time." },
        });
        failed++;
        continue;
      }
    }

    // ── 4. The transfer. Same key, same amount, every attempt. ──
    const args = transferArgsFor(
      { id: inf.id, connectAccountId: transferRow.stripeConnectAccountId, defaultCurrency: transferRow.currency },
      reqRow,
      transferRow.amountCents,
    );

    let stripeTransferId = transferRow.stripeTransferId;
    let refusal: unknown = null;
    let unknownError: unknown = null;
    for (let attempt = 0; !stripeTransferId && attempt < IN_RUN_ATTEMPTS; attempt++) {
      try {
        const t = await transfers.create(args.params, args.options);
        stripeTransferId = t.id;
      } catch (err) {
        if (isDefiniteRefusal(err)) {
          refusal = err;
          break;
        }
        unknownError = err;
      }
    }

    if (refusal) {
      // Stripe said no, so no money moved: release the rows and close it FAILED.
      await db.$transaction([
        db.commissionLedger.updateMany({
          where: { payoutTransferId: transferRow.id, state: LedgerEntryState.CLEARED },
          data: { payoutTransferId: null },
        }),
        db.payoutTransfer.update({
          where: { id: transferRow.id },
          data: { status: PayoutTransferStatus.FAILED, failureReason: errText(refusal) },
        }),
        db.payoutRequest.update({
          where: { id: reqRow.id },
          data: { status: PayoutRequestStatus.FAILED, rejectedReason: errText(refusal) },
        }),
      ]);
      failed++;
      continue;
    }

    if (!stripeTransferId) {
      // UNKNOWN. The money may have left. Nothing is released and nothing is
      // FAILED; the request stays PROCESSING (which blocks a new request) and the
      // next run retries with the same key while it is still inside the window.
      await db.payoutTransfer.update({
        where: { id: transferRow.id },
        data: { failureReason: `Unconfirmed: ${errText(unknownError)}` },
      });
      needsReview++;
      continue;
    }

    // ── 5. Record the Stripe id FIRST, on its own — the money is traceable even
    //       if the books below fail. ──
    if (!transferRow.stripeTransferId) {
      await db.payoutTransfer.update({
        where: { id: transferRow.id },
        data: { stripeTransferId, failureReason: null },
      });
    }

    // ── 6. Close the books for exactly the reserved rows. ──
    try {
      await db.$transaction([
        db.commissionLedger.updateMany({
          where: { payoutTransferId: transferRow.id, state: LedgerEntryState.CLEARED },
          data: { state: LedgerEntryState.PAID },
        }),
        db.commissionLedger.create({
          data: {
            influencerId: inf.id,
            attributionId: null,
            entryType: LedgerEntryType.PAID,
            amountCents: -transferRow.amountCents,
            currency: transferRow.currency,
            state: LedgerEntryState.PAID,
            payoutTransferId: transferRow.id,
            idempotencyKey: `pay:${stripeTransferId}`,
            memo: `Payout transfer ${stripeTransferId}`,
          },
        }),
        db.payoutTransfer.update({
          where: { id: transferRow.id },
          data: { status: PayoutTransferStatus.PAID, paidAt: new Date() },
        }),
        db.payoutRequest.update({
          where: { id: reqRow.id },
          data: { status: PayoutRequestStatus.PAID, amountCents: transferRow.amountCents },
        }),
      ]);
      paid++;
    } catch (err) {
      // An overlapping run can take a PROCESSING request too: both send the same
      // key (Stripe hands both the one transfer) and the second to reach the books
      // hits the unique `pay:<transfer>` key. If the transfer is already PAID the
      // other run closed it — that is success, not something to review.
      const closedElsewhere =
        (err as { code?: string }).code === "P2002" &&
        (await db.payoutTransfer.findUnique({ where: { id: transferRow.id }, select: { status: true } }))
          ?.status === PayoutTransferStatus.PAID;
      if (closedElsewhere) continue;
      // Otherwise the money has left and the id is recorded. The next run finds
      // this transfer row with an id and closes the books WITHOUT calling Stripe
      // again (step 4 is skipped when the id is known). Never FAILED.
      console.error(`[payouts] transfer ${stripeTransferId} sent but books not closed:`, err);
      needsReview++;
    }
  }

  return { paid, failed, notReady, needsReview };
}

/**
 * Reserve the CLEARED, unreserved rows this payout covers and create its
 * PayoutTransfer row, in one transaction. Negative rows (clawbacks) are always
 * taken; positive rows are taken oldest first until the approved amount would be
 * exceeded. Returns null when there is nothing positive to pay.
 */
async function reserveRows(
  requestId: string,
  inf: { id: string; connectAccountId: string | null; defaultCurrency: string },
  approvedCents: number,
) {
  return db.$transaction(async (tx) => {
    const rows = await tx.commissionLedger.findMany({
      where: { influencerId: inf.id, state: LedgerEntryState.CLEARED, payoutTransferId: null },
      select: { id: true, amountCents: true },
      orderBy: { createdAt: "asc" },
    });
    let total = 0;
    const chosen: string[] = [];
    for (const r of rows) {
      if (r.amountCents < 0) {
        total += r.amountCents;
        chosen.push(r.id);
      }
    }
    for (const r of rows) {
      if (r.amountCents < 0) continue;
      if (total + r.amountCents > approvedCents) break;
      total += r.amountCents;
      chosen.push(r.id);
    }
    if (total <= 0 || !inf.connectAccountId) return null;

    const transferRow = await tx.payoutTransfer.create({
      data: {
        influencerId: inf.id,
        payoutRequestId: requestId,
        amountCents: total,
        currency: inf.defaultCurrency,
        status: PayoutTransferStatus.PENDING,
        stripeConnectAccountId: inf.connectAccountId,
        idempotencyKey: `payout:${requestId}`,
      },
    });
    await tx.commissionLedger.updateMany({
      where: { id: { in: chosen }, payoutTransferId: null },
      data: { payoutTransferId: transferRow.id },
    });
    return transferRow;
  });
}
