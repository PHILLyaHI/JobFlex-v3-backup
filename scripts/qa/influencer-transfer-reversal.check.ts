// A reversed transfer is neither paid twice nor lost — through the REAL
// handlers, no Stripe call.
//
//   npx tsx --tsconfig tsconfig.json scripts/qa/influencer-transfer-reversal.check.ts
//
// The owner's rule (2026-09-22): on transfer.reversed the rows that transfer paid
// move to REVERSED_TRANSFER — owed, not pending, never re-paid automatically. The
// admin chooses Retry payout (rows back to CLEARED, the partner may request
// again) or Write off (closed with a note). Idempotent by transfer id.
//
// Rows are written in **QA Co** (slug `qa-co`), prefixed `qa-rev-`, and deleted
// on the way out, pass or fail. Payouts run through processApprovedPayouts with a
// recording stub in place of stripe.transfers.

delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_SECRET_KEY_TEST;

import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { accrueForInvoice, handleTransferEvent, reverseForCharge } from "../../src/lib/stripeSync";
import {
  processApprovedPayouts,
  releaseReversedPayout,
  writeOffReversedPayout,
  type TransferApi,
} from "../../src/lib/payouts";
import { ledgerBalances } from "../../src/lib/commission";
import { checkInfluencerPayouts } from "../../src/lib/integrationsHealth";

const db = new PrismaClient();
const QA_SLUG = "qa-co";
const P = "qa-rev-";

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
const stripeTransfer = (id: string, amount: number, reversedCents: number) =>
  ({ id, amount, amount_reversed: reversedCents, reversed: reversedCents >= amount }) as never;

function stub() {
  const calls: { amount: number; key: string }[] = [];
  const api: TransferApi = {
    async create(p, o) {
      calls.push({ amount: p.amount, key: o.idempotencyKey });
      return { id: `tr_${P}${calls.length}_${Math.random().toString(36).slice(2, 7)}` };
    },
  };
  return { api, calls };
}

async function books(influencerId: string) {
  const rows = await db.commissionLedger.findMany({
    where: { influencerId },
    select: { entryType: true, amountCents: true, state: true, payoutTransferId: true, idempotencyKey: true },
  });
  const net = (st: string) => rows.filter((r) => r.state === st).reduce((n, r) => n + r.amountCents, 0);
  return { rows, bal: ledgerBalances(rows), paidNet: net("PAID"), voidNet: net("VOID") };
}

async function invariant(label: string, influencerId: string) {
  const { bal, paidNet, voidNet, rows } = await books(influencerId);
  const sum = rows.reduce((n, r) => n + r.amountCents, 0);
  ok(`${label}: balance = sum of journal = pending + cleared + held + reversed-transfer (PAID, VOID net zero)`,
    bal.balanceCents === sum && paidNet === 0 && voidNet === 0 &&
      bal.balanceCents === bal.pendingCents + bal.clearedCents + bal.heldCents + bal.reversedTransferCents,
    `balance ${c(bal.balanceCents)} · cleared ${c(bal.clearedCents)} · reversed ${c(bal.reversedTransferCents)} · paid out ${c(bal.paidOutCents)} · paid-net ${c(paidNet)} · void-net ${c(voidNet)}`);
}

/** A partner with `accruals` cleared, approved for `approved`, paid by the stub. */
async function paidPartner(suffix: string, qaOrgId: string, accruals: number[], approved: number) {
  const inf = await db.influencer.create({
    data: {
      email: `${P}${suffix}@jobflex.test`,
      displayName: `QA Rev ${suffix}`,
      status: "ACTIVE",
      holdDays: 30,
      minPayoutCents: 100,
      payoutsEnabled: true,
      connectStatus: "ENABLED",
      connectAccountId: `acct_${P}${suffix}`,
    },
  });
  const promo = await db.promoCode.create({
    data: {
      influencerId: inf.id,
      code: `QAREV${suffix.toUpperCase().replace(/[^A-Z0-9]/g, "")}`,
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
  for (const [i, paid] of accruals.entries()) {
    await accrueForInvoice(invoice(`in_${P}${suffix}${i}`, sub, `ch_${P}${suffix}${i}`, paid));
  }
  await db.commissionLedger.updateMany({ where: { influencerId: inf.id }, data: { state: "CLEARED" } });
  const req = await db.payoutRequest.create({
    data: { influencerId: inf.id, amountCents: approved, currency: "usd", status: "APPROVED" },
  });
  const s = stub();
  await processApprovedPayouts(s.api);
  const t = await db.payoutTransfer.findUnique({ where: { idempotencyKey: `payout:${req.id}` } });
  return { inf, req, transfer: t!, calls: s.calls };
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
  return ids.length;
}

async function main() {
  await cleanup();
  const qaOrg = await db.organization.findUnique({ where: { slug: QA_SLUG }, select: { id: true, name: true } });
  if (!qaOrg) {
    console.error(`FAIL  QA Co (slug ${QA_SLUG}) is not seeded in this database — run the seed first.`);
    process.exit(1);
  }
  console.log(`reversed transfers · ${qaOrg.name} (${QA_SLUG}) · real handlers · no Stripe calls`);

  // ═══ 1. Paid, then reversed ═══
  head("1 · a paid transfer is reversed: rows to REVERSED_TRANSFER, still owed, not payable");
  const a = await paidPartner("retry", qaOrg.id, [7900, 7900], 3160);
  ok("paid first: one transfer of 3160¢", a.calls.length === 1 && a.calls[0].amount === 3160);
  const when = new Date("2026-09-25T10:00:00Z");
  await handleTransferEvent(stripeTransfer(a.transfer.stripeTransferId!, 3160, 3160), true, when);
  let bk = await books(a.inf.id);
  const accr = bk.rows.filter((r) => r.entryType === "ACCRUED");
  ok("the rows it paid are REVERSED_TRANSFER", accr.every((r) => r.state === "REVERSED_TRANSFER"), accr.map((r) => r.state).join(","));
  ok("owed again (balance 3160¢), not payable (cleared 0), not paid out (0)",
    bk.bal.balanceCents === 3160 && bk.bal.clearedCents === 0 && bk.bal.paidOutCents === 0 && bk.bal.reversedTransferCents === 3160,
    `balance ${c(bk.bal.balanceCents)} · paid out ${c(bk.bal.paidOutCents)}`);
  ok("an ADJUSTMENT keyed by the transfer id offsets the payout entry — the journal is appended, not edited",
    bk.rows.some((r) => r.entryType === "ADJUSTMENT" && r.idempotencyKey === `transfer-reversed:${a.transfer.stripeTransferId}` && r.amountCents === 3160) &&
      bk.rows.some((r) => r.entryType === "PAID" && r.amountCents === -3160));
  let req = await db.payoutRequest.findUnique({ where: { id: a.req.id } });
  ok("the request is marked 'transfer reversed' with the date, in words",
    req?.status === "REVERSED" && (req?.rejectedReason ?? "").includes("2026-09-25"), `${req?.status} · ${req?.rejectedReason}`);
  ok("the transfer row says so too", (await db.payoutTransfer.findUnique({ where: { id: a.transfer.id } }))?.status === "REVERSED");
  await invariant("after reversal", a.inf.id);

  // ═══ 2. The same event again ═══
  head("2 · the same transfer.reversed again changes nothing");
  const repeat = (await handleTransferEvent(stripeTransfer(a.transfer.stripeTransferId!, 3160, 3160), true, new Date())) as { skipped?: string };
  bk = await books(a.inf.id);
  ok("skipped as already reversed, still exactly one offset",
    repeat.skipped === "already-reversed" && bk.rows.filter((r) => r.entryType === "ADJUSTMENT").length === 1, String(repeat.skipped));

  // ═══ 3. Never paid again on its own ═══
  head("3 · a reversed payout is never re-sent automatically");
  const s3 = stub();
  const run3 = await processApprovedPayouts(s3.api);
  ok("the payout run sends nothing", s3.calls.length === 0, JSON.stringify(run3));
  const health = await checkInfluencerPayouts(new Date().toISOString());
  ok("the Health row asks for a decision", /reversed transfer.*awaiting Retry payout or Write off/.test(health.reason) && health.level === "degraded", health.reason);

  // ═══ 4. Retry payout — once ═══
  head("4 · Retry payout: rows back to CLEARED exactly once, the partner can request again");
  const r1 = await releaseReversedPayout(a.req.id, new Date("2026-09-26T00:00:00Z"));
  bk = await books(a.inf.id);
  ok("released 3160¢ to CLEARED, untied from the reversed transfer",
    r1.ok && r1.releasedCents === 3160 && bk.bal.clearedCents === 3160 &&
      bk.rows.filter((r) => r.entryType === "ACCRUED").every((r) => r.state === "CLEARED" && r.payoutTransferId === null),
    JSON.stringify(r1));
  req = await db.payoutRequest.findUnique({ where: { id: a.req.id } });
  ok("the request says 'returned to balance' with the date", req?.status === "RELEASED" && (req?.rejectedReason ?? "").includes("2026-09-26"), req?.rejectedReason ?? "");
  const r2 = await releaseReversedPayout(a.req.id);
  ok("a second Retry does nothing", !r2.ok && (await books(a.inf.id)).bal.clearedCents === 3160, JSON.stringify(r2));
  const w2 = await writeOffReversedPayout(a.req.id, "late click");
  ok("…and Write off after a Retry does nothing either", !w2.ok && (await books(a.inf.id)).bal.clearedCents === 3160);
  await invariant("after retry", a.inf.id);

  // The partner requests again; it is paid once.
  const req2 = await db.payoutRequest.create({ data: { influencerId: a.inf.id, amountCents: 3160, currency: "usd", status: "APPROVED" } });
  const s4 = stub();
  await processApprovedPayouts(s4.api);
  bk = await books(a.inf.id);
  ok("the new request is paid once, for the approved 3160¢, with a new key",
    s4.calls.length === 1 && s4.calls[0].amount === 3160 && s4.calls[0].key === `payout:${req2.id}`, JSON.stringify(s4.calls));
  ok("paid out 3160¢ in total, nothing owed", bk.bal.paidOutCents === 3160 && bk.bal.balanceCents === 0,
    `paid out ${c(bk.bal.paidOutCents)} · balance ${c(bk.bal.balanceCents)}`);
  await invariant("after the re-payment", a.inf.id);

  // ═══ 5. Write off ═══
  head("5 · Write off: closed with a note, balance to zero, never paid");
  const b = await paidPartner("writeoff", qaOrg.id, [7900], 1580);
  await handleTransferEvent(stripeTransfer(b.transfer.stripeTransferId!, 1580, 1580), true, when);
  const wo = await writeOffReversedPayout(b.req.id, "Bank account closed", new Date("2026-09-27T00:00:00Z"));
  bk = await books(b.inf.id);
  ok("written off 1580¢: rows VOID, balance 0, nothing payable",
    wo.ok && wo.writtenOffCents === 1580 && bk.bal.balanceCents === 0 && bk.bal.clearedCents === 0 && bk.bal.reversedTransferCents === 0,
    JSON.stringify(wo));
  const reqB = await db.payoutRequest.findUnique({ where: { id: b.req.id } });
  ok("the request carries the note and the date", reqB?.status === "WRITTEN_OFF" && /2026-09-27: Bank account closed/.test(reqB?.rejectedReason ?? ""), reqB?.rejectedReason ?? "");
  ok("Retry after a write-off does nothing", !(await releaseReversedPayout(b.req.id)).ok);
  await invariant("after write-off", b.inf.id);

  // ═══ 6. A refund on money waiting on a reversed transfer ═══
  head("6 · a refund on a reversed payout waits with it — Retry releases the net");
  const d = await paidPartner("refund", qaOrg.id, [7900], 1580);
  await handleTransferEvent(stripeTransfer(d.transfer.stripeTransferId!, 1580, 1580), true, when);
  await reverseForCharge({ id: `ch_${P}refund0`, amount: 7900, amount_refunded: 3950, invoice: `in_${P}refund0` } as never);
  bk = await books(d.inf.id);
  ok("the refund reversal is REVERSED_TRANSFER, tied to the same transfer",
    bk.rows.some((r) => r.entryType === "REVERSED" && r.state === "REVERSED_TRANSFER" && r.payoutTransferId === d.transfer.id) &&
      bk.bal.reversedTransferCents === 790, c(bk.bal.reversedTransferCents));
  const rd = await releaseReversedPayout(d.req.id);
  ok("Retry releases the net 790¢", rd.ok && rd.releasedCents === 790 && (await books(d.inf.id)).bal.clearedCents === 790, JSON.stringify(rd));
  await invariant("refund on a reversed payout", d.inf.id);

  // ═══ 7. A partial reversal is not guessed at ═══
  head("7 · a partial reversal changes no rows and asks a person");
  const e = await paidPartner("partial", qaOrg.id, [7900], 1580);
  const part = (await handleTransferEvent(stripeTransfer(e.transfer.stripeTransferId!, 1580, 500), true, when)) as { skipped?: string };
  bk = await books(e.inf.id);
  ok("rows stay PAID, the transfer is annotated",
    part.skipped === "partial-reversal" && bk.rows.filter((r) => r.entryType === "ACCRUED").every((r) => r.state === "PAID") &&
      /Partially reversed: \$5\.00 of \$15\.80/.test((await db.payoutTransfer.findUnique({ where: { id: e.transfer.id } }))?.failureReason ?? ""),
    String(part.skipped));
  ok("the Health row lists it", /partially reversed transfer/.test((await checkInfluencerPayouts(new Date().toISOString())).reason));

  // ═══ 7b. Reversed before our books closed ═══
  head("7b · reversed while our books were still open: no offset needed, still owed");
  const f = await paidPartner("openbooks", qaOrg.id, [7900], 1580);
  // Rewind to "Stripe answered, books never closed": rows reserved and CLEARED,
  // no PAID entry, transfer PENDING with its Stripe id.
  await db.commissionLedger.deleteMany({ where: { influencerId: f.inf.id, entryType: "PAID" } });
  await db.commissionLedger.updateMany({ where: { influencerId: f.inf.id }, data: { state: "CLEARED" } });
  await db.payoutTransfer.update({ where: { id: f.transfer.id }, data: { status: "PENDING" } });
  await db.payoutRequest.update({ where: { id: f.req.id }, data: { status: "PROCESSING" } });
  await handleTransferEvent(stripeTransfer(f.transfer.stripeTransferId!, 1580, 1580), true, when);
  bk = await books(f.inf.id);
  ok("rows move to REVERSED_TRANSFER, no ADJUSTMENT (there was no payout entry to offset)",
    bk.rows.every((r) => r.state === "REVERSED_TRANSFER") && !bk.rows.some((r) => r.entryType === "ADJUSTMENT") &&
      bk.bal.balanceCents === 1580, `balance ${c(bk.bal.balanceCents)}`);
  const s7 = stub();
  await processApprovedPayouts(s7.api);
  ok("the payout loop does not re-send a reversed transfer", s7.calls.length === 0);
  await invariant("reversed before books closed", f.inf.id);

  // ═══ 8. Wiring ═══
  head("8 · wiring");
  const route = readFileSync("src/app/api/webhooks/stripe/route.ts", "utf8");
  ok("transfer.reversed → handleTransferEvent with the event date",
    /case "transfer\.reversed":[\s\S]{0,200}handleTransferEvent\([^)]*true, new Date\(event\.created \* 1000\)\)/.test(route));
  const actions = readFileSync("src/actions/influencers.ts", "utf8");
  ok("both admin actions are gated and call the lib",
    /export async function retryReversedPayout[\s\S]{0,200}requirePlatformAdmin\(\)[\s\S]{0,120}releaseReversedPayout\(/.test(actions) &&
      /export async function writeOffPayout[\s\S]{0,200}requirePlatformAdmin\(\)[\s\S]{0,200}writeOffReversedPayout\(/.test(actions));

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
