// Subscription surface. "The Well-Kept Ledger" — a tier-tinted billing view
// wired to real data: current plan, next bill, real Stripe invoices, and the
// org's referral code. Server component; the (dashboard) layout supplies auth +
// the page container, so this just fetches and hands off to the client view.
//
// Plan data comes from the live catalog (admin-managed PricingPlan rows) and
// usage comes from the limits engine — the same caps that actually enforce.

import { redirect } from "next/navigation";
import { requireOrg, isOwnerRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { listSubscriptionInvoices } from "@/actions/billing";
import { getPlanCatalog, getOrgPlanContext } from "@/lib/planCatalogServer";
import { getOrgLimitUsage } from "@/lib/limitsEngine";
import { LIMIT_DEFS } from "@/lib/planLimits";
import { titleCaseSlug } from "@/lib/planCatalog";
import { SubscriptionView, type UsageRow } from "./subscription-view";

export const dynamic = "force-dynamic";

export default async function SubscriptionPage() {
  const { organizationId, role } = await requireOrg();
  // Billing is owner-only; managers and other roles bounce back to the dashboard
  // (the nav already hides the link — this is the fail-closed side).
  if (!isOwnerRole(role)) redirect("/dashboard");

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
    db.referralConversion.count({ where: { codeId: code.id, status: { in: ["CONVERTED", "PAID"] } } }),
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/auth/register?ref=${code.code}`;
  const rewardSummary =
    "Each contractor who signs up with it and goes paid takes 50% off one month of your subscription";

  return (
    <SubscriptionView
      planName={planDto?.name ?? titleCaseSlug(rawPlan)}
      priceCents={planDto ? planDto.priceCents : null}
      isFree={planDto?.isFree ?? false}
      currentSlug={planDto?.slug ?? rawPlan.toLowerCase()}
      plans={plans}
      status={status}
      nextBill={sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null}
      trialEndsAt={sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null}
      usage={usage}
      invoices={invoiceResult}
      referral={{
        code: code.code,
        shareUrl,
        rewardSummary,
        uses: refUses,
        converted: refConverted,
        pending: refPending,
      }}
    />
  );
}
