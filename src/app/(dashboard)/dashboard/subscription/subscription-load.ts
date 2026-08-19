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
import { titleCaseSlug, type PlanDTO } from "@/lib/planCatalog";
import type { SubscriptionInvoice } from "@/actions/billing";

// The result shape. These interfaces lived in ./subscription-view.tsx until
// 2026-08-13, when that desktop view was superseded by the blueprint page at
// src/app/dashboard/subscription (which renders SubscriptionContent and owns
// the /dashboard/subscription URL at every width). The loader survived the
// move because the /mobile-subscription-v2 preview page feeds from it, so the
// types it promises now live with it.
export interface UsageRow {
  resource: string;
  label: string;
  used: number;
  limit: number;
}

export interface SubscriptionViewProps {
  /** Display name of the current plan (catalog name, or title-cased orphan slug). */
  planName: string;
  /** Monthly price of the current plan; null when the slug left the catalog. */
  priceCents: number | null;
  /** Lowercase slug used to mark "current" in the spectrum + matrix. */
  currentSlug: string;
  /** Active catalog plans, display-ordered. */
  plans: PlanDTO[];
  status: string;
  nextBill: string | null;
  trialEndsAt: string | null;
  /** The limits engine's enforced caps for this org (unlimited keys omitted). */
  usage: UsageRow[];
  invoices: { available: boolean; invoices: SubscriptionInvoice[] };
  referral: {
    code: string;
    shareUrl: string;
    rewardSummary: string;
    uses: number;
    converted: number;
    pending: number;
  };
}

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

  // No subscription row → the stamp reads "inactive" (the Free tier is gone,
  // so absence of a subscription is no longer presented as a free plan).
  const status = sub?.status ?? "INACTIVE";
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
