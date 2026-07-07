// Member-referral conversion + reward engine (the ?ref= side of the
// attribution loop — the influencer ?promo= side lives in stripeSync.ts).
//
// Policy: each converted referral credits the REFERRER 50% of one month of
// their own current plan, as a Stripe customer-balance credit that nets against
// their upcoming subscription invoices. Two referrals → two half-month credits.
//
// Lifecycle: PENDING (signup recorded) → CONVERTED (referred org's first real
// paid invoice) → PAID (credit landed on the referrer's Stripe balance).
// CONVERTED with rewardAppliedAt=null means the credit is still owed — usually
// because the referrer has no Stripe customer yet (FREE plan). It self-heals on
// the referrer's own first invoice, and admins can retry from /admin/referrals.

import type Stripe from "stripe";
import { db } from "@/lib/db";
import { getStripe, isStripeEnabled } from "@/lib/sdk/stripe";
import { isStripeWriteAllowed } from "@/lib/stripeSafety";
import { PLAN_MONTHLY_USD } from "@/lib/planPricing";

export const REFERRAL_REWARD_PCT = 50;

/**
 * Webhook hook (invoice.paid). Idempotent by construction: the conversion
 * updateMany matches zero rows on re-runs, and the credit is idempotency-keyed
 * per conversion. Reward failures are swallowed (retried on the next invoice /
 * from the admin screen) so a credit hiccup never 500s the webhook.
 */
export async function processReferralEffectsForInvoice(invoice: Stripe.Invoice): Promise<void> {
  // Trials produce $0 invoices — a referral only converts on real money,
  // mirroring accrueForInvoice's guard.
  if (!invoice.paid || (invoice.amount_paid ?? 0) <= 0) return;
  const subId =
    typeof invoice.subscription === "string" ? invoice.subscription : (invoice.subscription?.id ?? null);
  if (!subId) return;

  const mirror = await db.subscription.findFirst({
    where: { externalSubId: subId },
    select: { organizationId: true },
  });
  if (!mirror) return;
  const orgId = mirror.organizationId;

  // (a) This org was a referred signup → its first real payment converts the referral.
  await db.referralConversion.updateMany({
    where: { signupOrgId: orgId, status: "PENDING" },
    data: { status: "CONVERTED", convertedAt: new Date() },
  });

  // (b) Credit converted-but-unrewarded referrals this invoice makes payable:
  // the one(s) just converted above (credit goes to their referrer), plus any
  // where THIS org is the referrer — it provably has a Stripe customer now.
  const payable = await db.referralConversion.findMany({
    where: {
      status: "CONVERTED",
      rewardAppliedAt: null,
      OR: [{ signupOrgId: orgId }, { code: { organizationId: orgId } }],
    },
    select: { id: true },
  });
  for (const conversion of payable) {
    try {
      await applyReferralReward(conversion.id);
    } catch (err) {
      console.warn(`[referral] reward credit failed for conversion ${conversion.id}:`, err);
    }
  }
}

/**
 * Apply the 50%-of-one-month credit for a single CONVERTED conversion.
 * Safe to call repeatedly: rewardAppliedAt gates re-entry locally and the
 * Stripe idempotency key (`refcredit:<conversionId>`) gates it remotely.
 */
export async function applyReferralReward(
  conversionId: string
): Promise<{ applied: boolean; reason?: string }> {
  const conversion = await db.referralConversion.findUnique({
    where: { id: conversionId },
    include: { code: { select: { organizationId: true } } },
  });
  if (!conversion) return { applied: false, reason: "not-found" };
  if (conversion.status === "PENDING") return { applied: false, reason: "not-converted" };
  if (conversion.rewardAppliedAt) return { applied: false, reason: "already-applied" };

  const referrerOrgId = conversion.code.organizationId;
  const referrerSub = await db.subscription.findUnique({
    where: { organizationId: referrerOrgId },
    select: { externalCustomerId: true, plan: true },
  });
  if (!referrerSub?.externalCustomerId) return { applied: false, reason: "no-stripe-customer" };
  if (!isStripeEnabled()) return { applied: false, reason: "stripe-disabled" };
  // Respect the live-write safety flag without throwing — the reward simply
  // stays owed (CONVERTED) until writes are allowed or an admin retries.
  if (!isStripeWriteAllowed()) return { applied: false, reason: "stripe-writes-disabled" };

  const monthlyCents = await referrerMonthlyPriceCents(referrerSub.plan);
  if (monthlyCents <= 0) return { applied: false, reason: "no-priced-plan" };
  const rewardCents = Math.round(monthlyCents * (REFERRAL_REWARD_PCT / 100));

  const txn = await getStripe().customers.createBalanceTransaction(
    referrerSub.externalCustomerId,
    {
      amount: -rewardCents, // negative = credit toward future invoices
      currency: "usd", // platform bills in USD; the credit must match the customer currency
      description: `JobFlex referral reward — ${REFERRAL_REWARD_PCT}% off one month`,
    },
    { idempotencyKey: `refcredit:${conversion.id}` }
  );

  await db.referralConversion.update({
    where: { id: conversion.id },
    data: {
      status: "PAID",
      rewardCents,
      rewardAppliedAt: new Date(),
      rewardStripeTxnId: txn.id,
    },
  });
  return { applied: true };
}

// 50% of one MONTH of the referrer's plan, even for annual payers: the real
// synced monthly Stripe price when one exists, else the admin catalog price,
// else the static fallback table.
async function referrerMonthlyPriceCents(plan: string): Promise<number> {
  const priced = await db.planPrice.findFirst({
    where: { planSlug: plan.toLowerCase(), interval: "MONTH", active: true },
    select: { unitAmountCents: true },
  });
  if (priced) return priced.unitAmountCents;
  const catalogRow = await db.pricingPlan.findFirst({
    where: { slug: { in: [plan, plan.toLowerCase(), plan.toUpperCase()] } },
    select: { priceCents: true },
  });
  if (catalogRow) return catalogRow.priceCents;
  return Math.round((PLAN_MONTHLY_USD[plan.toUpperCase()] ?? 0) * 100);
}
