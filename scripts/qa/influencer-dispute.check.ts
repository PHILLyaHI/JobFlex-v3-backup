// Chargebacks take the commission with them — through the REAL handlers, no
// Stripe call.
//
//   npx tsx --tsconfig tsconfig.json scripts/qa/influencer-dispute.check.ts
//
// The owner's rule (2026-09-22): a lost chargeback removes the commission
// exactly as a full refund does; while a dispute is open the commission is HELD
// (out of pending, the clock stopped, out of any payout); a won dispute releases
// it with the hold restarted from the close date; a dispute after a payout drives
// the balance negative and is paid back from the next commissions.
//
// Rows are written in **QA Co** (slug `qa-co`), prefixed `qa-dsp-`, and deleted
// on the way out, pass or fail. The payout step uses a recording stub in place
// of stripe.transfers.

delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_SECRET_KEY_TEST;

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import {
  accrueForInvoice,
  holdForDispute,
  settleDispute,
  reverseForCharge,
} from "../../src/lib/stripeSync";
import { clearDueCommissions } from "../../src/lib/reconcile";
import { processApprovedPayouts, type TransferApi } from "../../src/lib/payouts";
import { ledgerBalances } from "../../src/lib/commission";
import { moneyNotes } from "../../src/lib/influencerNotes";

const db = new PrismaClient();
const QA_SLUG = "qa-co";
const P = "qa-dsp-";
const DAY = 24 * 60 * 60 * 1000;

let passes = 0;
let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const c = (n: number) => `${n < 0 ? "-" : ""}$${(Math.abs(n) / 100).toFixed(2)}`;
const head = (s: string) => console.log(`\n── ${s}`);

const invoice = (id: string, sub: string, charge: string, paid: number) =>
  ({ id, subscription: sub, charge, paid: true, amount_paid: paid, subtotal: paid, currency: "usd", billing_reason: "subscription_cycle" }) as never;
const dispute = (id: string, charge: string, status: string, createdAt = Date.now()) =>
  ({ id, charge, amount: 7900, status, created: Math.floor(createdAt / 1000) }) as never;
const chargeObj = (id: string, amount: number, refunded: number, inv: string) =>
  ({ id, amount, amount_refunded: refunded, invoice: inv }) as never;

async function books(influencerId: string) {
  const rows = await db.commissionLedger.findMany({
    where: { influencerId },
    select: { entryType: true, amountCents: true, state: true, idempotencyKey: true, stripeChargeId: true, clearsAt: true },
  });
  const bal = ledgerBalances(rows);
  const net = (st: string) => rows.filter((r) => r.state === st).reduce((n, r) => n + r.amountCents, 0);
  return { rows, bal, paidNet: net("PAID"), voidNet: net("VOID") };
}

/** Balance = sum of the journal, and every row is in exactly one live bucket. */
async function invariant(label: string, influencerId: string) {
  const { bal, paidNet, voidNet, rows } = await books(influencerId);
  const sum = rows.reduce((n, r) => n + r.amountCents, 0);
  ok(`${label}: balance = sum of journal = pending + cleared + held (PAID and VOID net to zero)`,
    bal.balanceCents === sum && paidNet === 0 && voidNet === 0 &&
      bal.balanceCents === bal.pendingCents + bal.clearedCents + bal.heldCents,
    `balance ${c(bal.balanceCents)} · pending ${c(bal.pendingCents)} · cleared ${c(bal.clearedCents)} · held ${c(bal.heldCents)} · paid-net ${c(paidNet)} · void-net ${c(voidNet)}`);
}

async function partner(suffix: string, qaOrgId: string, over: Record<string, unknown> = {}) {
  const inf = await db.influencer.create({
    data: {
      email: `${P}${suffix}@jobflex.test`,
      displayName: `QA Dsp ${suffix}`,
      status: "ACTIVE",
      holdDays: 30,
      minPayoutCents: 100,
      payoutsEnabled: true,
      connectStatus: "ENABLED",
      connectAccountId: `acct_${P}${suffix}`,
      ...over,
    },
  });
  const promo = await db.promoCode.create({
    data: {
      influencerId: inf.id,
      code: `QADSP${suffix.toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
      stripeCouponId: `local_coupon_${P}${suffix}`,
      stripePromotionCodeId: `local_promo_${P}${suffix}`,
      commissionType: "PERCENT",
      commissionRateBps: 2000,
      commissionBasis: "NET",
      durationType: "FOREVER",
    },
  });
  const sub = `sub_${P}${suffix}`;
  await db.attribution.create({
    data: {
      influencerId: inf.id,
      promoCodeId: promo.id,
      organizationId: qaOrgId,
      stripeCustomerId: `cus_${P}${suffix}`,
      stripeSubscriptionId: sub,
      status: "ACTIVE",
    },
  });
  return { inf, sub };
}

async function cleanup() {
  const infs = await db.influencer.findMany({ where: { email: { startsWith: P } }, select: { id: true } });
  const ids = infs.map((i) => i.id);
  if (ids.length) {
    await db.commissionLedger.deleteMany({ where: { influencerId: { in: ids } } });
    await db.payoutTransfer.deleteMany({ where: { influencerId: { in: ids } } });
    await db.payoutRequest.deleteMany({ where: { influencerId: { in: ids } } });
    await db.attribution.deleteMany({ where: { influencerId: { in: ids } } });
    await db.promoCode.deleteMany({ where: { influencerId: { in: ids } } });
    await db.influencer.deleteMany({ where: { id: { in: ids } } });
  }
  await db.syncState.deleteMany({ where: { key: { startsWith: `dispute:ch_${P}` } } });
  return ids.length;
}

async function main() {
  await cleanup();
  const qaOrg = await db.organization.findUnique({ where: { slug: QA_SLUG }, select: { id: true, name: true } });
  if (!qaOrg) {
    console.error(`FAIL  QA Co (slug ${QA_SLUG}) is not seeded in this database — run the seed first.`);
    process.exit(1);
  }
  console.log(`chargebacks · ${qaOrg.name} (${QA_SLUG}) · real handlers · no Stripe calls`);

  // ═══ A. Open dispute → HELD ═══
  head("A · a dispute opens on a pending commission: HELD, out of pending, out of payouts");
  const a = await partner("open", qaOrg.id);
  await accrueForInvoice(invoice(`in_${P}a`, a.sub, `ch_${P}a`, 7900));
  const opened = new Date("2026-09-01T12:00:00Z");
  const held = (await holdForDispute(dispute(`du_${P}a`, `ch_${P}a`, "needs_response"), opened)) as { heldRows?: number };
  let bk = await books(a.inf.id);
  ok("the accrual is HELD", held.heldRows === 1 && bk.rows.every((r) => r.state === "HELD"), JSON.stringify(held));
  ok("not in pending, not in cleared, counted as held",
    bk.bal.pendingCents === 0 && bk.bal.clearedCents === 0 && bk.bal.heldCents === 1580, c(bk.bal.heldCents));
  ok("the hold clock is stopped (no clearsAt)", bk.rows.every((r) => r.clearsAt === null));
  await clearDueCommissions();
  bk = await books(a.inf.id);
  ok("the clear cron does not release it", bk.rows.every((r) => r.state === "HELD"));
  await db.payoutRequest.create({ data: { influencerId: a.inf.id, amountCents: 1580, currency: "usd", status: "APPROVED" } });
  const calls: number[] = [];
  const stubApi: TransferApi = { async create(p) { calls.push(p.amount); return { id: `tr_${P}${calls.length}` }; } };
  await processApprovedPayouts(stubApi);
  ok("a payout run cannot take it — no transfer, request fails for want of cleared money",
    calls.length === 0, `${calls.length} transfer(s)`);
  const notesA = await moneyNotes(a.inf.id);
  ok("the portal says 'on hold' with the date the dispute opened",
    notesA.length === 1 && notesA[0].kind === "held" && notesA[0].amountCents === 1580 && notesA[0].date === opened.toISOString(),
    JSON.stringify(notesA[0]));
  await invariant("A", a.inf.id);

  // ═══ B. Lost → REVERSED, idempotent by dispute id ═══
  head("B · the dispute is lost: the whole commission is reversed, once");
  const lostRes = (await settleDispute(dispute(`du_${P}a`, `ch_${P}a`, "lost"), `evt_${P}lost`, new Date("2026-09-20T00:00:00Z"))) as { reversedCents?: number };
  bk = await books(a.inf.id);
  const cb = bk.rows.filter((r) => r.idempotencyKey.startsWith("dispute:"));
  ok("a REVERSED entry for the full 1580¢, keyed by the dispute id",
    lostRes.reversedCents === 1580 && cb.length === 1 && cb[0].amountCents === -1580 && cb[0].idempotencyKey.startsWith(`dispute:du_${P}a:`),
    JSON.stringify(lostRes));
  ok("the accrual and the chargeback close together as VOID — nothing left owed",
    bk.rows.every((r) => r.state === "VOID") && bk.bal.balanceCents === 0, c(bk.bal.balanceCents));
  const again = (await settleDispute(dispute(`du_${P}a`, `ch_${P}a`, "lost"), `evt_${P}lost2`)) as { skipped?: string };
  ok("the same dispute closing again changes nothing", again.skipped === "already-closed" &&
    (await books(a.inf.id)).rows.filter((r) => r.idempotencyKey.startsWith("dispute:")).length === 1, String(again.skipped));
  const lateOpen = (await holdForDispute(dispute(`du_${P}a`, `ch_${P}a`, "needs_response"))) as { skipped?: string };
  ok("a dispute.created that arrives after the close is ignored", lateOpen.skipped === "already-closed", String(lateOpen.skipped));
  const notesB = await moneyNotes(a.inf.id);
  ok("the portal shows a 'chargeback' line dated the day the dispute was lost",
    notesB.some((n) => n.kind === "chargeback" && n.amountCents === -1580 && n.date === "2026-09-20T00:00:00.000Z"),
    JSON.stringify(notesB));
  await invariant("B", a.inf.id);

  // ═══ C. Won → PENDING, hold restarted from the close date ═══
  head("C · the dispute is won: nothing reversed, back to PENDING, hold counted from the close");
  const cP = await partner("won", qaOrg.id);
  await accrueForInvoice(invoice(`in_${P}c`, cP.sub, `ch_${P}c`, 7900));
  await holdForDispute(dispute(`du_${P}c`, `ch_${P}c`, "needs_response"), new Date("2026-09-01T00:00:00Z"));
  const closed = new Date("2026-10-15T00:00:00Z");
  const won = (await settleDispute(dispute(`du_${P}c`, `ch_${P}c`, "won"), `evt_${P}won`, closed)) as { released?: number };
  bk = await books(cP.inf.id);
  ok("released, nothing reversed", won.released === 1 && !bk.rows.some((r) => r.entryType === "REVERSED"), JSON.stringify(won));
  ok("back to PENDING with clearsAt = close date + 30 days",
    bk.rows[0].state === "PENDING" && bk.rows[0].clearsAt?.getTime() === closed.getTime() + 30 * DAY,
    `${bk.rows[0].state} · clears ${bk.rows[0].clearsAt?.toISOString()}`);
  const wonAgain = (await settleDispute(dispute(`du_${P}c`, `ch_${P}c`, "won"), `evt_${P}won2`, new Date())) as { skipped?: string };
  ok("closing again does not move the clock", wonAgain.skipped === "already-closed" &&
    (await books(cP.inf.id)).rows[0].clearsAt?.getTime() === closed.getTime() + 30 * DAY);
  await invariant("C", cP.inf.id);

  // ═══ D. Dispute on money already cleared (not yet paid) ═══
  head("D · a dispute on CLEARED, unpaid commission freezes it too — won brings it back as PENDING");
  const d = await partner("cleared", qaOrg.id);
  await accrueForInvoice(invoice(`in_${P}d`, d.sub, `ch_${P}d`, 7900));
  await db.commissionLedger.updateMany({ where: { influencerId: d.inf.id }, data: { state: "CLEARED" } });
  await holdForDispute(dispute(`du_${P}d`, `ch_${P}d`, "needs_response"));
  bk = await books(d.inf.id);
  ok("taken out of the payable balance", bk.bal.clearedCents === 0 && bk.bal.heldCents === 1580);
  await settleDispute(dispute(`du_${P}d`, `ch_${P}d`, "warning_closed"), `evt_${P}d`, new Date());
  bk = await books(d.inf.id);
  ok("an inquiry closed without a chargeback releases it like a win — PENDING, not CLEARED",
    bk.rows[0].state === "PENDING" && !!bk.rows[0].clearsAt, bk.rows[0].state);
  await invariant("D", d.inf.id);

  // ═══ E. Dispute AFTER the payout ═══
  head("E · a dispute after the money was paid: balance goes negative, the next commission pays it back");
  const e = await partner("afterpay", qaOrg.id);
  await accrueForInvoice(invoice(`in_${P}e1`, e.sub, `ch_${P}e1`, 6320));
  await db.commissionLedger.updateMany({ where: { influencerId: e.inf.id }, data: { state: "CLEARED" } });
  await db.payoutRequest.create({ data: { influencerId: e.inf.id, amountCents: 1264, currency: "usd", status: "APPROVED" } });
  const eCalls: number[] = [];
  await processApprovedPayouts({ async create(p) { eCalls.push(p.amount); return { id: `tr_${P}e` }; } });
  ok("paid out 1264¢ first", eCalls[0] === 1264);
  const eHold = (await holdForDispute(dispute(`du_${P}e`, `ch_${P}e1`, "needs_response"))) as { heldRows?: number };
  ok("nothing is held — the money has already left", eHold.heldRows === 0, JSON.stringify(eHold));
  await settleDispute(dispute(`du_${P}e`, `ch_${P}e1`, "lost"), `evt_${P}e`, new Date());
  bk = await books(e.inf.id);
  ok("the chargeback lands CLEARED and drives the balance to −1264¢",
    bk.bal.clearedCents === -1264 && bk.bal.balanceCents === -1264, `cleared ${c(bk.bal.clearedCents)}`);
  ok("the portal shows it as a chargeback", (await moneyNotes(e.inf.id)).some((n) => n.kind === "chargeback" && n.amountCents === -1264));
  await accrueForInvoice(invoice(`in_${P}e2`, e.sub, `ch_${P}e2`, 7900));
  await db.commissionLedger.updateMany({ where: { influencerId: e.inf.id, state: "PENDING" }, data: { clearsAt: new Date(Date.now() - 1000) } });
  await clearDueCommissions();
  bk = await books(e.inf.id);
  ok("the next commission pays it back first: 1580 − 1264 = 316¢ payable",
    bk.bal.clearedCents === 316, c(bk.bal.clearedCents));
  await db.payoutRequest.create({ data: { influencerId: e.inf.id, amountCents: 316, currency: "usd", status: "APPROVED" } });
  await processApprovedPayouts({ async create(p) { eCalls.push(p.amount); return { id: `tr_${P}e2` }; } });
  ok("the next payout is the netted 316¢ — never more than approved", eCalls[1] === 316, `sent ${c(eCalls[1] ?? 0)}`);
  await invariant("E", e.inf.id);

  // ═══ F. Partial refund, then a lost dispute ═══
  head("F · half refunded, then disputed and lost: the rest is reversed, never more than the whole");
  const f = await partner("partial", qaOrg.id);
  await accrueForInvoice(invoice(`in_${P}f`, f.sub, `ch_${P}f`, 7900));
  await reverseForCharge(chargeObj(`ch_${P}f`, 7900, 3950, `in_${P}f`));
  await holdForDispute(dispute(`du_${P}f`, `ch_${P}f`, "needs_response"));
  bk = await books(f.inf.id);
  ok("the accrual and its refund reversal are frozen together", bk.rows.every((r) => r.state === "HELD") && bk.bal.heldCents === 790);
  const fLost = (await settleDispute(dispute(`du_${P}f`, `ch_${P}f`, "lost"), `evt_${P}f`, new Date())) as { reversedCents?: number };
  bk = await books(f.inf.id);
  ok("only the remaining 790¢ is reversed", fLost.reversedCents === 790, JSON.stringify(fLost));
  ok("everything nets to zero", bk.bal.balanceCents === 0 && bk.rows.every((r) => r.state === "VOID"));
  await invariant("F", f.inf.id);

  // ═══ G. A refund while the dispute is open stays frozen with it ═══
  head("G · a refund during an open dispute is held with the commission");
  const g = await partner("refundheld", qaOrg.id);
  await accrueForInvoice(invoice(`in_${P}g`, g.sub, `ch_${P}g`, 7900));
  await holdForDispute(dispute(`du_${P}g`, `ch_${P}g`, "needs_response"));
  await reverseForCharge(chargeObj(`ch_${P}g`, 7900, 3950, `in_${P}g`));
  bk = await books(g.inf.id);
  ok("the refund reversal is written HELD, not PENDING", bk.rows.every((r) => r.state === "HELD") && bk.bal.heldCents === 790);
  await invariant("G", g.inf.id);

  // ═══ H. The webhook accepts both events ═══
  head("H · the webhook routes both dispute events");
  const route = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
  ok("charge.dispute.created → holdForDispute", /case "charge\.dispute\.created":[\s\S]{0,300}holdForDispute\(/.test(route));
  ok("charge.dispute.closed → settleDispute", /case "charge\.dispute\.closed":[\s\S]{0,300}settleDispute\(/.test(route));

  console.log(`\n${passes} passed, ${failures} failed`);
  const removed = await cleanup();
  console.log(`      · cleaned up ${removed} partner(s) and everything hanging off them`);
  await db.$disconnect();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error("\ncheck crashed:", err);
  try {
    await cleanup();
  } catch {
    /* best effort */
  }
  await db.$disconnect();
  process.exit(2);
});
