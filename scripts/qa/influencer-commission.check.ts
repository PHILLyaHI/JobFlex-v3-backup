// Synthetic check of the influencer commission guards — no network, no browser,
// NO STRIPE CALL of any kind. The webhook handlers take plain objects, so the
// money path can be exercised by hand-building the payloads Stripe would send.
//
//   npx tsx --tsconfig tsconfig.json scripts/qa/influencer-commission.check.ts
//
// ORGANISATION. Everything runs inside **QA Co** (slug `qa-co`, owner
// `qa@acme.test`) — limits are per organisation and nothing a check does may be
// charged to an organisation a person works in. The one test that must go
// through syncSubscriptionFromStripe snapshots QA Co's Subscription row and puts
// it back, because that function upserts the billing mirror.
//
// Rows it writes are prefixed `qa-inf-` and deleted on the way out, pass or fail.
import { PrismaClient } from "@prisma/client";
import { accrueForInvoice, isSelfReferral, syncSubscriptionFromStripe } from "../../src/lib/stripeSync";

const db = new PrismaClient();
const QA_SLUG = "qa-co";
const QA_OWNER = "qa@acme.test";
const P = "qa-inf-";

let passes = 0;
let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) passes++;
  else failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};
const cents = (n: number) => `$${(n / 100).toFixed(2)}`;

// ── synthetic Stripe payloads: only the fields the handlers read ──
function invoice(id: string, subId: string, chargeId: string | null, amountPaid: number) {
  return {
    id,
    subscription: subId,
    charge: chargeId,
    paid: true,
    amount_paid: amountPaid,
    subtotal: amountPaid,
    currency: "usd",
  } as never;
}
function subscription(id: string, orgId: string, promotionCodeId: string | null) {
  return {
    id,
    customer: `cus_${P}${id}`,
    status: "active",
    metadata: { organizationId: orgId },
    items: { data: [{ price: { id: `price_${P}79` } }] },
    current_period_end: Math.floor(Date.parse("2026-12-01T00:00:00Z") / 1000),
    canceled_at: null,
    discount: promotionCodeId ? { promotion_code: promotionCodeId, coupon: null } : null,
  } as never;
}

async function makeInfluencer(suffix: string, over: Record<string, unknown> = {}) {
  return db.influencer.create({
    data: {
      email: `${P}${suffix}@jobflex.test`,
      displayName: `QA Inf ${suffix}`,
      status: "ACTIVE",
      holdDays: 30,
      minPayoutCents: 2500,
      ...over,
    },
  });
}
async function makePromo(influencerId: string, code: string) {
  return db.promoCode.create({
    data: {
      influencerId,
      code,
      stripeCouponId: `local_coupon_${code}`,
      stripePromotionCodeId: `local_promo_${code}`,
      commissionType: "PERCENT",
      commissionRateBps: 2000,
      commissionBasis: "NET",
      durationType: "FOREVER",
      customerPercentOff: 20,
    },
  });
}

async function cleanup() {
  const infs = await db.influencer.findMany({
    where: { OR: [{ email: { startsWith: P } }, { displayName: { startsWith: "QA Inf " } }] },
    select: { id: true },
  });
  const ids = infs.map((i) => i.id);
  if (ids.length) {
    await db.commissionLedger.deleteMany({ where: { influencerId: { in: ids } } });
    await db.attribution.deleteMany({ where: { influencerId: { in: ids } } });
    await db.promoCode.deleteMany({ where: { influencerId: { in: ids } } });
    await db.influencer.deleteMany({ where: { id: { in: ids } } });
  }
  await db.attribution.deleteMany({ where: { stripeSubscriptionId: { startsWith: `sub_${P}` } } });
  await db.user.deleteMany({ where: { email: { startsWith: P } } });
  return ids.length;
}

async function main() {
  await cleanup();

  const qaOrg = await db.organization.findUnique({ where: { slug: QA_SLUG }, select: { id: true, name: true } });
  if (!qaOrg) {
    console.error(`FAIL  QA Co (slug ${QA_SLUG}) is not seeded in this database — run the seed first.`);
    process.exit(1);
  }
  const owner = await db.user.findUnique({ where: { email: QA_OWNER }, select: { id: true } });
  if (!owner) {
    console.error(`FAIL  ${QA_OWNER} is not seeded in this database — run the seed first.`);
    process.exit(1);
  }
  console.log(`influencer commission guards · ${qaOrg.name} (${QA_SLUG}) · no Stripe calls\n`);

  // ── SELF-REFERRAL, leg 1: the influencer's linked app account owns the org ──
  const linked = await makeInfluencer("linked", { userId: owner.id });
  const linkedPromo = await makePromo(linked.id, "QAINFLINKED");
  ok("isSelfReferral: an influencer whose linked account owns the org",
    await isSelfReferral(linked.id, qaOrg.id));

  const attrLinked = await db.attribution.create({
    data: {
      influencerId: linked.id,
      promoCodeId: linkedPromo.id,
      organizationId: qaOrg.id,
      stripeCustomerId: `cus_${P}linked`,
      stripeSubscriptionId: `sub_${P}linked`,
      status: "ACTIVE",
    },
  });
  const rLinked = (await accrueForInvoice(invoice(`in_${P}linked`, attrLinked.stripeSubscriptionId, `ch_${P}linked`, 6320))) as {
    accruedCents?: number;
    skipped?: string;
  };
  ok("an ACTIVE self-referral attribution accrues nothing",
    rLinked.skipped === "self-referral",
    rLinked.accruedCents ? `ACCRUED ${cents(rLinked.accruedCents)}` : `skipped: ${rLinked.skipped}`);
  ok("no ledger row was written for it",
    (await db.commissionLedger.count({ where: { influencerId: linked.id } })) === 0);

  // ── SELF-REFERRAL, leg 2: same email, accounts never linked ──
  const byEmail = await db.influencer.create({
    data: { email: QA_OWNER, displayName: "QA Inf byEmail", status: "ACTIVE", holdDays: 30, minPayoutCents: 2500 },
  });
  ok("isSelfReferral: an unlinked influencer whose email is the org owner's",
    await isSelfReferral(byEmail.id, qaOrg.id));

  // ── CONTROL: an unrelated influencer earns normally on the same org ──
  const outsider = await makeInfluencer("outsider");
  const outsiderPromo = await makePromo(outsider.id, "QAINFOUTSIDE");
  ok("isSelfReferral: an unrelated influencer is NOT self-referral",
    (await isSelfReferral(outsider.id, qaOrg.id)) === false);
  const attrOut = await db.attribution.create({
    data: {
      influencerId: outsider.id,
      promoCodeId: outsiderPromo.id,
      organizationId: qaOrg.id,
      stripeCustomerId: `cus_${P}out`,
      stripeSubscriptionId: `sub_${P}out`,
      status: "ACTIVE",
    },
  });
  const rOut = (await accrueForInvoice(invoice(`in_${P}out`, attrOut.stripeSubscriptionId, `ch_${P}out`, 6320))) as {
    accruedCents?: number;
    skipped?: string;
  };
  ok("the control still accrues 20% NET of 6320¢ = 1264¢",
    rOut.accruedCents === 1264,
    JSON.stringify(rOut));

  // ── isSelfReferral with no organization: unknowable, so not blocked ──
  ok("an attribution with no resolved organization is not treated as self-referral",
    (await isSelfReferral(outsider.id, null)) === false);

  // ── THE WRITE-TIME STAMP. syncSubscriptionFromStripe upserts QA Co's billing
  //    mirror, so snapshot it and put it back afterwards. ──
  const mirrorBefore = await db.subscription.findUnique({ where: { organizationId: qaOrg.id } });
  try {
    await syncSubscriptionFromStripe(
      subscription(`sub_${P}stamp`, qaOrg.id, linkedPromo.stripePromotionCodeId),
    );
    const stamped = await db.attribution.findUnique({ where: { stripeSubscriptionId: `sub_${P}stamp` } });
    ok("a self-referral attribution is written VOID, not ACTIVE",
      stamped?.status === "VOID",
      `status ${stamped?.status} — the row is kept so the admin sees the code was used`);
    const rStamp = (await accrueForInvoice(invoice(`in_${P}stamp`, `sub_${P}stamp`, `ch_${P}stamp`, 6320))) as {
      skipped?: string;
    };
    ok("a VOID attribution never reaches the accrual", rStamp.skipped === "no-active-attribution", String(rStamp.skipped));

    await syncSubscriptionFromStripe(
      subscription(`sub_${P}stamp2`, qaOrg.id, outsiderPromo.stripePromotionCodeId),
    );
    const stamped2 = await db.attribution.findUnique({ where: { stripeSubscriptionId: `sub_${P}stamp2` } });
    ok("an unrelated influencer's attribution is still written ACTIVE",
      stamped2?.status === "ACTIVE",
      String(stamped2?.status));
  } finally {
    // Put QA Co's subscription mirror back exactly as it was.
    if (mirrorBefore) {
      await db.subscription.update({
        where: { organizationId: qaOrg.id },
        data: {
          plan: mirrorBefore.plan,
          status: mirrorBefore.status,
          provider: mirrorBefore.provider,
          externalCustomerId: mirrorBefore.externalCustomerId,
          externalSubId: mirrorBefore.externalSubId,
          stripePriceId: mirrorBefore.stripePriceId,
          currentPeriodEnd: mirrorBefore.currentPeriodEnd,
          canceledAt: mirrorBefore.canceledAt,
          appliedPromotionCodeId: mirrorBefore.appliedPromotionCodeId,
          appliedCouponId: mirrorBefore.appliedCouponId,
          attributionId: mirrorBefore.attributionId,
        },
      });
    } else {
      await db.subscription.deleteMany({ where: { organizationId: qaOrg.id } });
    }
    const mirrorAfter = await db.subscription.findUnique({ where: { organizationId: qaOrg.id } });
    ok("QA Co's subscription mirror was restored",
      (mirrorBefore?.plan ?? null) === (mirrorAfter?.plan ?? null) &&
        (mirrorBefore?.externalSubId ?? null) === (mirrorAfter?.externalSubId ?? null) &&
        (mirrorBefore?.attributionId ?? null) === (mirrorAfter?.attributionId ?? null),
      `plan ${mirrorAfter?.plan ?? "(none)"} · sub ${mirrorAfter?.externalSubId ?? "(none)"}`);
  }

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
