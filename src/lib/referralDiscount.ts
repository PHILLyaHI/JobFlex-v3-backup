// THE REFERRED SHOP'S SIDE OF A REFERRAL.
//
// Until 2026-09-02 a member referral code did exactly one thing: it credited
// the REFERRER 50% of a month once the new shop paid (lib/referralRewards).
// The person who typed the code got nothing, and the plan step said "code
// applied" over a price that had not moved (owner's report). A referral now
// carries a discount for the new shop as well, applied at Stripe Checkout as
// a coupon on the subscription, so every invoice reflects it.
//
// One coupon per Stripe mode (live / sandbox), created on first use and
// cached in SyncState alongside the price cache — the same pattern
// lib/stripePriceCache uses, for the same reason: a coupon per checkout would
// litter the dashboard.
import type Stripe from "stripe";
import { db } from "@/lib/db";
import type { StripeMode } from "@/lib/stripeMode";

/** Percent off the referred shop's plan. Shown on the plan step and applied
 *  at checkout; change it here and both move together. */
export const REFERRAL_DISCOUNT_PCT = 10;

/** FIRST MONTH ONLY (owner, 2026-09-02). Not `once`: with a trial, Stripe's
 *  first invoice is the $0 trial invoice and a once-coupon is spent on it.
 *  `repeating` counts calendar months from the day it is applied, so with a
 *  14-day trial the first PAID invoice (day 14) falls inside month 1 and the
 *  second (day 44) does not. A trial of a month or more needs two months to
 *  reach its first paid invoice — the caller passes `months` from trialDays. */
export function referralCouponMonths(trialDays: number): number {
  return trialDays >= 28 ? 2 : 1;
}

export async function ensureReferralCoupon(
  stripe: Stripe,
  mode: StripeMode,
  months = 1,
): Promise<string> {
  const key = `stripeCoupon:${mode}:referral${REFERRAL_DISCOUNT_PCT}:m${months}`;
  const cached = await db.syncState.findUnique({ where: { key } }).catch(() => null);
  if (cached?.cursor) {
    // The cached id must still exist on that account; a deleted coupon would
    // fail the checkout it is attached to.
    try {
      const c = await stripe.coupons.retrieve(cached.cursor);
      if (c && !c.deleted && c.valid) return c.id;
    } catch {
      /* fall through and mint a fresh one */
    }
  }
  const coupon = await stripe.coupons.create({
    percent_off: REFERRAL_DISCOUNT_PCT,
    duration: "repeating",
    duration_in_months: months,
    name: `JobFlex referral — ${REFERRAL_DISCOUNT_PCT}% off first month`,
    metadata: { jfKind: "referral", months: String(months) },
  });
  await db.syncState
    .upsert({ where: { key }, update: { cursor: coupon.id }, create: { key, cursor: coupon.id } })
    .catch(() => {});
  return coupon.id;
}
