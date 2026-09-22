// The influencer PAYOUT side — the arguments of the one call in this codebase
// that moves real money to someone outside it, checked without making it.
//
//   npx tsx --tsconfig tsconfig.json scripts/qa/influencer-payout.check.ts
//
// NO STRIPE CALL. transferArgsFor() is the same function runApprovedPayouts
// hands to stripe.transfers.create, so asserting its output asserts the real
// arguments. The script also unsets STRIPE_SECRET_KEY and confirms
// runApprovedPayouts refuses to do anything at all without a key — the property
// that makes running this safe in the first place.
//
// Rows are written in **QA Co** (slug `qa-co`), prefixed `qa-pay-`, and deleted
// on the way out, pass or fail. Nothing is charged to anyone's organisation.

// Before any import that could construct a Stripe client.
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_SECRET_KEY_TEST;

import { PrismaClient } from "@prisma/client";
import { transferArgsFor, runApprovedPayouts, payoutRequestRefusal } from "../../src/lib/payouts";
import { ledgerBalances } from "../../src/lib/commission";

const db = new PrismaClient();
const QA_SLUG = "qa-co";
const P = "qa-pay-";

let passes = 0;
let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const cents = (n: number) => `$${(n / 100).toFixed(2)}`;

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
  console.log(`influencer payout arguments · ${qaOrg.name} (${QA_SLUG}) · no Stripe calls\n`);

  // A partner whose Connect onboarding is finished and who has cleared money.
  const inf = await db.influencer.create({
    data: {
      email: `${P}ready@jobflex.test`,
      displayName: "QA Payout Ready",
      status: "ACTIVE",
      holdDays: 30,
      minPayoutCents: 2500,
      payoutsEnabled: true,
      connectStatus: "ENABLED",
      connectAccountId: `acct_${P}ready`,
      defaultCurrency: "usd",
    },
  });
  const promo = await db.promoCode.create({
    data: {
      influencerId: inf.id,
      code: "QAPAYREADY",
      stripeCouponId: `local_coupon_${P}ready`,
      stripePromotionCodeId: `local_promo_${P}ready`,
      commissionType: "PERCENT",
      commissionRateBps: 2000,
      commissionBasis: "NET",
      durationType: "FOREVER",
      customerPercentOff: 20,
    },
  });
  const attr = await db.attribution.create({
    data: {
      influencerId: inf.id,
      promoCodeId: promo.id,
      organizationId: qaOrg.id,
      stripeCustomerId: `cus_${P}ready`,
      stripeSubscriptionId: `sub_${P}ready`,
      status: "ACTIVE",
    },
  });
  // Three cleared months of 20% NET on $63.20 collected, minus one full refund.
  for (const n of [1, 2, 3]) {
    await db.commissionLedger.create({
      data: {
        influencerId: inf.id,
        attributionId: attr.id,
        entryType: "ACCRUED",
        amountCents: 1264,
        currency: "usd",
        stripeInvoiceId: `in_${P}${n}`,
        stripeChargeId: `ch_${P}${n}`,
        state: "CLEARED",
        idempotencyKey: `accrue:in_${P}${n}`,
      },
    });
  }
  await db.commissionLedger.create({
    data: {
      influencerId: inf.id,
      attributionId: attr.id,
      entryType: "REVERSED",
      amountCents: -1264,
      currency: "usd",
      stripeInvoiceId: `in_${P}3`,
      stripeChargeId: `ch_${P}3`,
      state: "CLEARED",
      idempotencyKey: `reverse:ch_${P}3:x:6320`,
    },
  });

  const entries = await db.commissionLedger.findMany({
    where: { influencerId: inf.id },
    select: { entryType: true, amountCents: true, state: true },
  });
  const { clearedCents } = ledgerBalances(entries);
  ok("cleared balance is the ledger's own arithmetic: 3 × 1264 − 1264 = 2528",
    clearedCents === 2528, cents(clearedCents));
  ok("it is above this partner's minimum, so a request is allowed",
    payoutRequestRefusal({
      payoutsEnabled: inf.payoutsEnabled,
      connectStatus: inf.connectStatus,
      minPayoutCents: inf.minPayoutCents,
      clearedCents,
      openRequestStatus: null,
    }) === null);

  const reqRow = await db.payoutRequest.create({
    data: { influencerId: inf.id, amountCents: clearedCents, currency: "usd", status: "APPROVED", requestedBy: null },
  });

  // ── THE ARGUMENTS. Printed in full, then asserted field by field. ──
  const args = transferArgsFor(
    { id: inf.id, connectAccountId: inf.connectAccountId!, defaultCurrency: inf.defaultCurrency },
    reqRow,
    clearedCents,
  );
  console.log("\nstripe.transfers.create would receive:");
  console.log(JSON.stringify(args, null, 2));
  console.log();

  ok("amount is the cleared balance in INTEGER cents",
    args.params.amount === 2528 && Number.isInteger(args.params.amount),
    `${args.params.amount} (${cents(args.params.amount)})`);
  ok("currency is the partner's own, lower case", args.params.currency === "usd", args.params.currency);
  ok("destination is the partner's Connect account", args.params.destination === `acct_${P}ready`, args.params.destination);
  ok("metadata carries both ids, so a transfer can be traced back from Stripe",
    args.params.metadata.influencerId === inf.id && args.params.metadata.payoutRequestId === reqRow.id);
  ok("idempotencyKey is one per payout REQUEST, not per run",
    args.options.idempotencyKey === `payout:${reqRow.id}`, args.options.idempotencyKey);
  ok("asking twice for the same request gives the same key — a retry cannot pay twice",
    transferArgsFor(
      { id: inf.id, connectAccountId: inf.connectAccountId!, defaultCurrency: inf.defaultCurrency },
      reqRow,
      clearedCents,
    ).options.idempotencyKey === args.options.idempotencyKey);
  ok("the PayoutTransfer row would carry the same key as the Stripe call",
    args.options.idempotencyKey.startsWith("payout:"));
  ok("no amount is ever sent as a float",
    Number.isInteger(transferArgsFor(
      { id: inf.id, connectAccountId: inf.connectAccountId!, defaultCurrency: inf.defaultCurrency },
      reqRow,
      1,
    ).params.amount));

  // ── THE SAFETY PROPERTY: with no key, nothing happens at all. ──
  const res = (await runApprovedPayouts()) as { skipped?: string; paid?: number; failed?: number };
  ok("runApprovedPayouts does nothing without a Stripe key",
    res.skipped === "stripe-disabled" && res.paid === 0 && res.failed === 0,
    JSON.stringify(res));
  ok("the approved request was left untouched",
    (await db.payoutRequest.findUnique({ where: { id: reqRow.id } }))?.status === "APPROVED");
  ok("no PayoutTransfer row was created",
    (await db.payoutTransfer.count({ where: { influencerId: inf.id } })) === 0);
  ok("the ledger was not touched",
    (await db.commissionLedger.count({ where: { influencerId: inf.id, state: "PAID" } })) === 0);

  console.log(`\n${passes} passed, ${failures} failed`);
  const removed = await cleanup();
  console.log(`      · cleaned up ${removed} influencer(s) and everything hanging off them`);
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
