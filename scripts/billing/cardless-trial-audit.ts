// CARD-LESS TRIAL RECORDS THAT DRIFTED — READ ONLY (owner, 2026-10-07).
//
//   npx tsx --tsconfig tsconfig.json scripts/billing/cardless-trial-audit.ts            # local dev.db
//   npx tsx --tsconfig tsconfig.json scripts/billing/cardless-trial-audit.ts --stripe   # + Stripe reads
//   … --prod   reads C:\Users\ivana\Downloads\prod-db-url.txt (deleted at once) and needs the LIVE key
//
// Two lists, nothing written anywhere — no database row, no Stripe object:
//
//   A. PLAN. The record (SyncState cardlessTrial:<orgId>) keeps the plan picked
//      at signup; the subscription may be on another one since (a plan switch,
//      a billed edit by support, a custom plan's pages). Before lib/trialPlan
//      the ribbon, /dashboard/trial, the reminders and the checkout after the
//      trial's end named and sold the record's. Listed: every record whose
//      plan or interval differs from what lib/trialPlan reads off the
//      subscription now (the custom plan's pages are shown beside it).
//
//   B. STATUS. The admin's "Sync from Stripe" (actions/adminUsers) used to
//      write CANCELED over TRIAL_ENDED for a card-less trial that ran out.
//      Listed: records with no restartedAt whose subscription row is CANCELED.
//      With --stripe each is read back: "lapse" = Stripe says the trial ran out
//      with no card (the row should say TRIAL_ENDED), anything else = a real
//      cancellation.

import path from "node:path";
import Module from "node:module";
import { ROOT, openEnvironment } from "./_prod";

// lib/sdk/stripe and lib/trialPlan open with `import "server-only"`, which Next
// resolves to its own compiled copy; outside Next it is the package's no-op twin.
{
  const M = Module as unknown as { _resolveFilename: (req: string, ...rest: unknown[]) => string };
  const orig = M._resolveFilename;
  const noop = path.join(ROOT, "node_modules/next/dist/compiled/server-only/empty.js");
  M._resolveFilename = function (req: string, ...rest: unknown[]) {
    if (req === "server-only") return noop;
    return orig.call(this, req, ...rest);
  };
}

const PROD = process.argv.includes("--prod");
const READ_STRIPE = process.argv.includes("--stripe");

async function main() {
  const { where } = openEnvironment({ prod: PROD, out: path.join(ROOT, ".cache/cardless-trial-audit"), allowLiveWrites: false });
  console.log(`cardless-trial-audit — ${where} — read only${READ_STRIPE ? ", with Stripe reads" : ""}\n`);

  const { db } = await import("../../src/lib/db");
  const { currentTrialPlan } = await import("../../src/lib/trialPlan");
  const { isCardlessTrialLapse } = await import("../../src/lib/stripeStatus");
  type CardlessRecord = import("../../src/lib/trialState").CardlessRecord;
  const stripe = READ_STRIPE ? (await (await import("../../src/lib/sdk/stripe")).getStripeClient()).stripe : null;

  const rows = await db.syncState.findMany({ where: { key: { startsWith: "cardlessTrial:" } }, select: { key: true, cursor: true } });
  const planRows: string[][] = [];
  const statusRows: string[][] = [];
  let unreadable = 0;
  for (const row of rows) {
    const orgId = row.key.slice("cardlessTrial:".length);
    let rec: CardlessRecord;
    try {
      rec = JSON.parse(row.cursor) as CardlessRecord;
      if (!rec?.subId) throw new Error("no subId");
    } catch {
      unreadable += 1;
      continue;
    }
    const [org, sub] = await Promise.all([
      db.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
      db.subscription.findUnique({ where: { organizationId: orgId }, select: { plan: true, status: true, externalSubId: true, stripePriceId: true, provider: true } }),
    ]);
    const name = org?.name ?? "(organization gone)";
    const onTrialSub = sub?.externalSubId === rec.subId;

    // A — only while the row still follows the trial's subscription: once it
    // moved on (a paid checkout, a comp) the record names nothing on screen.
    if (onTrialSub && !rec.restartedAt) {
      const now = await currentTrialPlan(orgId, rec);
      if (now.planSlug !== rec.planSlug || now.interval !== rec.interval) {
        planRows.push([
          orgId,
          name,
          sub!.status,
          `${rec.planSlug}/${rec.interval}`,
          `${now.planSlug}/${now.interval}`,
          now.planSlug === "custom" ? `${rec.customPages.length} → ${now.customPages.length} pages` : "",
        ]);
      }
    }

    // B
    if (!rec.restartedAt && sub?.status === "CANCELED") {
      let stripeSays = "";
      if (stripe) {
        try {
          const s = await stripe.subscriptions.retrieve(rec.subId);
          stripeSays = isCardlessTrialLapse(s) ? "lapse — should read TRIAL_ENDED" : `real ${s.status}`;
        } catch {
          stripeSays = "not on this Stripe account";
        }
      }
      statusRows.push([orgId, name, onTrialSub ? rec.subId : `${rec.subId} (row now ${sub.externalSubId ?? "none"})`, rec.endedAt ?? "—", rec.cardAt ? "card on file" : "no card", stripeSays]);
    }
  }

  const table = (head: string[], body: string[][]) => {
    if (!body.length) return console.log("  (none)\n");
    console.log("  " + head.join(" | "));
    for (const r of body) console.log("  " + r.join(" | "));
    console.log("");
  };
  console.log(`${rows.length} card-less trial record(s)${unreadable ? `, ${unreadable} unreadable` : ""}\n`);
  console.log(`A. Plan in the record ≠ plan on the subscription — ${planRows.length}`);
  table(["org", "name", "status", "record", "subscription", "pages"], planRows);
  console.log(`B. Record without restartedAt, row CANCELED — ${statusRows.length}`);
  table(["org", "name", "subscription", "endedAt", "card", "Stripe"], statusRows);
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
