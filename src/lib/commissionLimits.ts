// THE CEILING ON A PARTNER'S SHARE (owner, 2026-09-22). A percentage code pays
// at most half of what the subscriber pays; a flat code pays at most the price
// of the cheapest paid plan — above that a single $29 signup would pay out more
// than it brought in. Enforced where a code is written (createInfluencer,
// createPromoCode, updatePromoCommission); codes written before the rule are
// left as they are and pointed out on /admin/influencers instead.
//
// The bound is on the SERVER (lib, not the form): both admin forms are
// noValidate, and an input's `max` blocks nothing.

import { db } from "@/lib/db";
import { CommissionType } from "@/lib/prismaEnums";

/** Percent points — 50 means "50% of the invoice". Both bases: gross is more, not less. */
export const PERCENT_MAX = 50;

const usd = (cents: number) => (cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`);

/** The cheapest active PAID plan's monthly price, or null when there is none to bound by. */
export async function cheapestPaidPlanCents(): Promise<number | null> {
  const row = await db.pricingPlan.findFirst({
    where: { active: true, priceCents: { gt: 0 } },
    orderBy: { priceCents: "asc" },
    select: { priceCents: true },
  });
  return row?.priceCents ?? null;
}

/**
 * The refusal, in words, for a model in the admin's units (percent points or
 * whole dollars) — or null when it is inside the limits.
 */
export function commissionRefusal(
  m: { commissionType: string; commissionValue: number },
  cheapestPlanCents: number | null,
): string | null {
  if (m.commissionType === CommissionType.PERCENT && m.commissionValue > PERCENT_MAX) {
    return `A partner's share is at most ${PERCENT_MAX}% of what the subscriber pays — enter ${PERCENT_MAX} or less.`;
  }
  if (m.commissionType === CommissionType.FLAT && cheapestPlanCents !== null) {
    if (Math.round(m.commissionValue * 100) > cheapestPlanCents) {
      return `A flat commission cannot exceed the cheapest plan, ${usd(cheapestPlanCents)} a month — enter ${usd(cheapestPlanCents)} or less.`;
    }
  }
  return null;
}

/** True for a stored code that sits above today's limit (written before the rule, or the plans got cheaper). */
export function promoAboveLimit(
  p: { commissionType: string; commissionRateBps: number | null; commissionFlatCents: number | null },
  cheapestPlanCents: number | null,
): boolean {
  if (p.commissionType === CommissionType.PERCENT) return (p.commissionRateBps ?? 0) > PERCENT_MAX * 100;
  if (p.commissionType === CommissionType.FLAT && cheapestPlanCents !== null) {
    return (p.commissionFlatCents ?? 0) > cheapestPlanCents;
  }
  return false;
}

/** The sentence the admin page shows beside such a code. */
export function aboveLimitNote(cheapestPlanCents: number | null): string {
  return cheapestPlanCents === null
    ? `Above the limit: percentage codes pay at most ${PERCENT_MAX}%.`
    : `Above the limit: at most ${PERCENT_MAX}% for a percentage code, ${usd(cheapestPlanCents)} (the cheapest plan) for a flat one. Written before the rule; edit the terms to bring it under.`;
}
