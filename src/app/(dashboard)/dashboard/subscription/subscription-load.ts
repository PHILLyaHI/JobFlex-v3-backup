// The subscription surface's ONE data read.
//
// Extracted verbatim from this folder's page.tsx on 2026-08-12 so the handheld
// preview route (/mobile-subscription-v2) and the live URL (/dashboard/
// subscription) run exactly the same query set instead of two copies that can
// drift. NOTHING was added, removed or changed in the process: same calls, same
// arguments, same order, same derived values. No new query, no new server
// action, no new API route, no schema change.
//
// Server-only by construction — it imports Prisma and two server actions, so a
// client component importing it would fail the build rather than leak.
//
// The OWNER-ONLY GUARD is deliberately NOT here: it belongs at the route, where
// the redirect target is a route-level decision, and burying an authorisation
// check inside a loader is how one gets forgotten. Both callers perform it
// before calling this, and `listSubscriptionInvoices` / `getOrCreateMyReferralCode`
// re-assert it themselves through requireOwner().

import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { listSubscriptionInvoices } from "@/actions/billing";
import { getPlanCatalog, getOrgPlanContext } from "@/lib/planCatalogServer";
import { getOrgLimitUsage } from "@/lib/limitsEngine";
import { LIMIT_DEFS } from "@/lib/planLimits";
import { titleCaseSlug } from "@/lib/planCatalog";
import type { SubscriptionViewProps, UsageRow } from "./subscription-view";

export async function loadSubscriptionData(
  organizationId: string,
): Promise<SubscriptionViewProps> {
  const [sub, planContext, plans, limitUsage, code, invoiceResult] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    getOrgPlanContext(organizationId),
    getPlanCatalog(),
    getOrgLimitUsage(organizationId),
    getOrCreateMyReferralCode(),
    listSubscriptionInvoices(),
  ]);

  const [refUses, refConverted, refPending] = await Promise.all([
    db.referralConversion.count({ where: { codeId: code.id } }),
    db.referralConversion.count({
      where: { codeId: code.id, status: { in: ["CONVERTED", "PAID"] } },
    }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PENDING" } }),
  ]);

  const status = sub?.status ?? "FREE";
  const { plan: planDto, rawPlan } = planContext;

  // Only finite caps render as usage bars; unlimited keys are omitted.
  const usage: UsageRow[] = limitUsage
    .filter((u) => u.limit !== null)
    .map((u) => ({
      resource: u.resource,
      label: LIMIT_DEFS.find((d) => d.key === u.resource)?.label ?? u.resource,
      used: u.used,
      limit: u.limit as number,
    }));

  const appUrl = await appBaseUrl();
  const shareUrl = `${appUrl}/auth/register?ref=${code.code}`;
  const rewardSummary =
    "Each contractor who signs up with it and goes paid takes 50% off one month of your subscription";

  return {
    planName: planDto?.name ?? titleCaseSlug(rawPlan),
    priceCents: planDto ? planDto.priceCents : null,
    isFree: planDto?.isFree ?? false,
    currentSlug: planDto?.slug ?? rawPlan.toLowerCase(),
    plans,
    status,
    nextBill: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    trialEndsAt: sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
    usage,
    invoices: invoiceResult,
    referral: {
      code: code.code,
      shareUrl,
      rewardSummary,
      uses: refUses,
      converted: refConverted,
      pending: refPending,
    },
  };
}
