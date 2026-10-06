// CUSTOM PLAN → BASE + PAGE × QUANTITY (owner, 2026-10-06; lib/customBilling).
//
//   npx tsx --tsconfig tsconfig.json scripts/billing/custom-plan-migrate.ts                 # dry run (default)
//   npx tsx --tsconfig tsconfig.json scripts/billing/custom-plan-migrate.ts --apply         # convert
//   npx tsx --tsconfig tsconfig.json scripts/billing/custom-plan-migrate.ts --apply --trust-pages
//   … --prod   reads C:\Users\ivana\Downloads\prod-db-url.txt (deleted at once) and needs the LIVE key
//
// Every organization on the custom plan (Subscription.plan = CUSTOM) with a
// Stripe subscription is put on the two-price model, IN PLACE:
//   · a legacy one-price subscription ("custom", one price per total) gets its
//     line deleted and base ×1 + page × N added, with proration "none" — the
//     total does not move, nothing is charged or credited;
//   · organizationId + customPages are written into the subscription's
//     metadata (the signup path never did).
// N is the number of pages in OUR record (SyncState orgPages:<orgId>), the
// source of truth for access.
//
// MISMATCHES ARE NEVER FIXED SILENTLY. When what Stripe bills is not what our
// record says (the old checkout-return replay could grant pages that were
// never paid for: $20 billed, 5 pages open), the row is reported and skipped.
// --trust-pages bills the recorded pages instead (the customer's price goes UP
// or DOWN to match, from the next bill, no proration) — an owner decision per
// run, never the default.
//
// No schema change: everything lives in Stripe and in SyncState.

import path from "node:path";
import Module from "node:module";
import type Stripe from "stripe";
import { ROOT, openEnvironment } from "./_prod";

// lib/sdk/stripe opens with `import "server-only"`, which Next resolves to its
// own compiled copy; outside Next it is the package's no-op twin.
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const noop = path.join(ROOT, "node_modules/next/dist/compiled/server-only/empty.js");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return noop;
    return orig.call(this, req, ...rest);
  };
}

const APPLY = process.argv.includes("--apply");
const TRUST_PAGES = process.argv.includes("--trust-pages");
const PROD = process.argv.includes("--prod");

type Row = {
  org: string;
  sub: string;
  status: string;
  pages: number;
  billedCents: number;
  expectedCents: number;
  /** Pending invoice items on the customer — e.g. the old addCustomPages
   *  left a page charge behind when its invoice failed. Reported only. */
  pendingCents: number;
  model: "legacy" | "two-price" | "other";
  action: string;
};

async function main() {
  const { where } = openEnvironment({ prod: PROD, out: path.join(ROOT, ".cache/custom-plan-migrate"), allowLiveWrites: APPLY });
  console.log(`custom-plan-migrate — ${where} — ${APPLY ? "APPLY" : "dry run"}${TRUST_PAGES ? " --trust-pages" : ""}\n`);

  const { db } = await import("../../src/lib/db");
  const { getStripeClient, isStripeEnabled } = await import("../../src/lib/sdk/stripe");
  const { customPriceCents } = await import("../../src/lib/customPlan");
  const billing = await import("../../src/lib/customBilling");
  if (!isStripeEnabled()) throw new Error("Stripe is not configured");
  const { stripe, mode } = await getStripeClient();

  const subs = await db.subscription.findMany({
    where: { plan: { in: ["CUSTOM", "custom", "Custom"] }, externalSubId: { not: null } },
    select: { organizationId: true, externalSubId: true },
  });
  const rows: Row[] = [];
  for (const s of subs) {
    const pages = await billing.readOrgPages(s.organizationId);
    let sub: Stripe.Subscription;
    try {
      sub = await stripe.subscriptions.retrieve(s.externalSubId!);
    } catch {
      rows.push({ org: s.organizationId, sub: s.externalSubId!, status: "missing", pages: pages.length, billedCents: 0, expectedCents: 0, pendingCents: 0, model: "other", action: "SKIP — not on this Stripe account" });
      continue;
    }
    const interval = billing.intervalOf(sub);
    const billedCents = sub.items.data.reduce((sum, i) => sum + (i.price.unit_amount ?? 0) * (i.quantity ?? 1), 0);
    const expectedCents = customPriceCents(pages, interval);
    const items = billing.customItemsOf(sub);
    const model: Row["model"] = items.base && !items.legacy.length ? "two-price" : items.legacy.length ? "legacy" : "other";
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const pendingCents = (await stripe.invoiceItems.list({ customer, pending: true, limit: 100 })).data.reduce((sum, i) => sum + i.amount, 0);
    const row: Row = { org: s.organizationId, sub: sub.id, status: sub.status, pages: pages.length, billedCents, expectedCents, pendingCents, model, action: "" };
    rows.push(row);

    if (!["active", "trialing", "past_due"].includes(sub.status)) {
      row.action = "SKIP — subscription is " + sub.status;
      continue;
    }
    if (model === "other") {
      row.action = "SKIP — not a custom price (check by hand)";
      continue;
    }
    const metaOk = sub.metadata?.organizationId === s.organizationId && (sub.metadata?.customPages ?? "") === pages.join(",");
    const mismatch = billedCents !== expectedCents;
    if (mismatch && !TRUST_PAGES) {
      row.action = `MISMATCH — Stripe bills $${billedCents / 100}, our ${pages.length} page(s) = $${expectedCents / 100}; skipped (--trust-pages to bill the pages)`;
      continue;
    }
    if (model === "two-price" && !mismatch && metaOk) {
      row.action = "ok — already migrated";
      continue;
    }
    row.action =
      model === "legacy"
        ? `convert → base ×1 + page ×${pages.length}${mismatch ? ` (price ${billedCents / 100} → ${expectedCents / 100} from next bill)` : ""}`
        : mismatch
          ? `set page quantity ${billing.billedPageCount(sub)} → ${pages.length} (from next bill)`
          : "write metadata";
    if (!APPLY) continue;
    try {
      let next = sub;
      if (model === "legacy") {
        next = await billing.convertLegacyCustomSubscription(stripe, mode, sub, s.organizationId, pages);
      }
      const page = billing.customItemsOf(next).page;
      const prices = await billing.customPrices(stripe, mode, interval);
      const qtyItems: Stripe.SubscriptionUpdateParams.Item[] =
        billing.billedPageCount(next) === pages.length
          ? []
          : page
            ? [pages.length ? { id: page.id, quantity: pages.length } : { id: page.id, deleted: true }]
            : [{ price: prices.page, quantity: pages.length }];
      next = await stripe.subscriptions.update(next.id, {
        ...(qtyItems.length ? { items: qtyItems } : {}),
        proration_behavior: "none",
        metadata: { ...(next.metadata ?? {}), ...billing.customMetadata(s.organizationId, pages) },
      });
      const base = billing.customItemsOf(next).base;
      if (base) await db.subscription.update({ where: { organizationId: s.organizationId }, data: { stripePriceId: base.price.id } });
      row.action = "DONE — " + row.action;
    } catch (err) {
      row.action = "FAILED — " + (err instanceof Error ? err.message : String(err));
    }
  }

  console.table(rows.map((r) => ({ org: r.org, sub: r.sub, status: r.status, model: r.model, pages: r.pages, billed: `$${r.billedCents / 100}`, ours: `$${r.expectedCents / 100}`, pending: r.pendingCents ? `$${r.pendingCents / 100}` : "", action: r.action })));
  const mismatches = rows.filter((r) => r.action.startsWith("MISMATCH"));
  console.log(`\n${rows.length} custom subscription(s); ${mismatches.length} mismatch(es)${APPLY ? "" : " — dry run, nothing written"}.`);
  if (rows.some((r) => r.pendingCents)) console.log("Pending invoice items are left as they are — review them in Stripe (they bill on the next invoice).");
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
