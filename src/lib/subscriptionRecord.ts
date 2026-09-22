// THE ONE WRITE THAT PUTS AN ORGANIZATION ON A PLAN after a checkout.
//
// It lived inline in the upgrade page's verifyReturn, which is the right place
// to decide WHETHER the plan changed (that decision needs the Stripe session)
// but not the only place that needs to record one: the dev simulator
// (api/dev/simulate-plan, TEMP 2026-09-19) must land an organization on a plan
// exactly the way a paid checkout does, and a second copy of this upsert is
// how the two would drift. So the write is here, unchanged in what it writes,
// and both callers call it.

import { db } from "@/lib/db";
import type { SubscriptionStatus } from "@/lib/prismaEnums";
import { planSnapshot, reportPlanChange } from "@/lib/activation-events";

/* WHICH SUBSCRIPTION THE MIRROR MAY FOLLOW NEXT. An organisation's mirror names
 * one Stripe subscription, and Stripe keeps sending events for the ones it
 * replaced — the reconcile cron replays every subscription newest first, so a
 * cancelled predecessor is synced AFTER its successor. The reference below is
 * the newest subscription the mirror has been moved to (its creation time, or
 * the moment a checkout return recorded it); lib/stripeSync lets an older one
 * write the mirror no more. */
export const mirrorSubAtKey = (organizationId: string) => `mirrorSubAt:${organizationId}`;

export async function recordMirrorReference(organizationId: string, ms: number) {
  await db.syncState
    .upsert({
      where: { key: mirrorSubAtKey(organizationId) },
      update: { cursor: String(ms) },
      create: { key: mirrorSubAtKey(organizationId), cursor: String(ms) },
    })
    .catch(() => {
      /* best effort — the reference only ever narrows what may overwrite the mirror */
    });
}

export interface PlanChangeRecord {
  organizationId: string;
  /** Catalog slug, lowercase; stored uppercased, the way every reader expects. */
  planSlug: string;
  status: (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];
  /** Stripe ids when a real checkout produced them; null keeps the row's own. */
  customerId: string | null;
  subId: string | null;
  trialEnd: Date | null;
  periodEnd: Date | null;
}

/** Upsert the organization's subscription mirror for a plan change. Returns
 *  the slug it recorded, so callers can hand it straight to the page. */
export async function recordPlanChange(rec: PlanChangeRecord): Promise<string> {
  const { organizationId, planSlug, status, customerId, subId, trialEnd, periodEnd } = rec;
  const planWas = await planSnapshot(organizationId);
  await db.subscription.upsert({
    where: { organizationId },
    update: {
      plan: planSlug.toUpperCase(),
      status,
      provider: "STRIPE",
      ...(customerId ? { externalCustomerId: customerId } : {}),
      ...(subId ? { externalSubId: subId } : {}),
      trialEndsAt: trialEnd,
      currentPeriodEnd: periodEnd,
    },
    create: {
      organizationId,
      plan: planSlug.toUpperCase(),
      status,
      provider: "STRIPE",
      externalCustomerId: customerId,
      externalSubId: subId,
      trialEndsAt: trialEnd,
      currentPeriodEnd: periodEnd,
    },
  });
  reportPlanChange(organizationId, "checkout", planWas);
  // The subscription this checkout produced was created moments ago; anything
  // older must not take the mirror back.
  if (subId) await recordMirrorReference(organizationId, Date.now());
  return planSlug;
}
