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

/** A subscription that names an organization which no longer exists. */
export type ReconcileSkip = { subscription: string; status: string; organizationId: string | null };
/** One row that threw; the run carried on past it. */
export type ReconcileFailure = { id: string; error: string };

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).replace(/\s+/g, " ").slice(0, 300);

// Bounded recent sweep (last 100 subscriptions + 100 paid invoices). Enough as a
// backstop for dropped webhooks; widen / paginate via SyncState if volume grows.
//
// ONE ROW NEVER STOPS THE RUN. Each subscription and each invoice is synced in
// its own try/catch: a subscription whose organization was deleted is skipped
// and listed, any other failure is logged and listed, and the rest still sync.
export async function reconcileStripe() {
  if (!isStripeEnabled()) return { skipped: "stripe-disabled", subscriptions: 0, invoices: 0 };
  const stripe = getStripe();

  let subscriptions = 0;
  let invoices = 0;
  const missingOrganization: ReconcileSkip[] = [];
  const failed: ReconcileFailure[] = [];

  const subList = await stripe.subscriptions.list({ limit: 100, status: "all" });
  for (const sub of subList.data) {
    try {
      const res = await syncSubscriptionFromStripe(sub, stripe);
      if (!res.synced && res.reason === "organization-missing") {
        missingOrganization.push({ subscription: sub.id, status: sub.status, organizationId: res.organizationId });
        continue;
      }
      subscriptions++;
    } catch (err) {
      console.error(`[reconcile] subscription ${sub.id} failed:`, err);
      failed.push({ id: sub.id, error: errorText(err) });
    }
  }

  const invList = await stripe.invoices.list({ limit: 100, status: "paid" });
  for (const inv of invList.data) {
    try {
      await accrueForInvoice(inv, undefined, stripe);
      invoices++;
    } catch (err) {
      console.error(`[reconcile] invoice ${inv.id} failed:`, err);
      failed.push({ id: inv.id ?? "invoice", error: errorText(err) });
    }
  }

  if (missingOrganization.length) {
    console.warn(
      `[reconcile] skipped ${missingOrganization.length} subscription(s) whose organization no longer exists: ` +
        missingOrganization.map((s) => `${s.subscription} (${s.status}) → ${s.organizationId}`).join(", "),
    );
  }

  await db.syncState.upsert({
    where: { key: "reconcile-stripe" },
    update: { cursor: String(Math.floor(Date.now() / 1000)) },
    create: { key: "reconcile-stripe", cursor: String(Math.floor(Date.now() / 1000)) },
  });

  return { subscriptions, invoices, missingOrganization, failed };
}
