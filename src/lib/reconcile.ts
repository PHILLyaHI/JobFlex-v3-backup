// Server-only reconciliation backstop. Re-syncs the Subscription mirror and
// re-asserts commission accruals straight from Stripe, repairing any dropped
// webhook. Safe to re-run: syncSubscriptionFromStripe upserts, and accrual is
// guarded by the unique `accrue:<invoiceId>` ledger key.

import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { syncSubscriptionFromStripe, accrueForInvoice } from "@/lib/stripeSync";

// Flip accruals out of the hold window into CLEARED (payable). Reversals that
// offset a pending accrual carry the same clearsAt, so they net on the way out.
export async function clearDueCommissions() {
  const res = await db.commissionLedger.updateMany({
    where: { state: "PENDING", clearsAt: { lte: new Date() } },
    data: { state: "CLEARED" },
  });
  return { cleared: res.count };
}

// Bounded recent sweep (last 100 subscriptions + 100 paid invoices). Enough as a
// backstop for dropped webhooks; widen / paginate via SyncState if volume grows.
export async function reconcileStripe() {
  if (!isStripeEnabled()) return { skipped: "stripe-disabled", subscriptions: 0, invoices: 0 };
  const stripe = getStripe();

  let subscriptions = 0;
  let invoices = 0;

  const subList = await stripe.subscriptions.list({ limit: 100, status: "all" });
  for (const sub of subList.data) {
    await syncSubscriptionFromStripe(sub);
    subscriptions++;
  }

  const invList = await stripe.invoices.list({ limit: 100, status: "paid" });
  for (const inv of invList.data) {
    await accrueForInvoice(inv);
    invoices++;
  }

  await db.syncState.upsert({
    where: { key: "reconcile-stripe" },
    update: { cursor: String(Math.floor(Date.now() / 1000)) },
    create: { key: "reconcile-stripe", cursor: String(Math.floor(Date.now() / 1000)) },
  });

  return { subscriptions, invoices };
}
