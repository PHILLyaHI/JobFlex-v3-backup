// Subscription surface. "The Well-Kept Ledger" — a tier-tinted billing view
// wired to real data: current plan, next bill, real Stripe invoices, and the
// org's referral code. Server component; the (dashboard) layout supplies auth +
// the page container, so this just fetches and hands off to the client view.

import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getOrgPlan, type Plan } from "@/lib/entitlements";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { listSubscriptionInvoices } from "@/actions/billing";
import { money } from "@/lib/format";
import { SubscriptionView } from "./subscription-view";

export const dynamic = "force-dynamic";

const PLAN_QUOTAS: Record<Plan, { proposalsPerMonth: number; aiDraftsPerMonth: number }> = {
  FREE: { proposalsPerMonth: 5, aiDraftsPerMonth: 3 },
  STARTER: { proposalsPerMonth: 25, aiDraftsPerMonth: 25 },
  PROFESSIONAL: { proposalsPerMonth: 200, aiDraftsPerMonth: 200 },
  ENTERPRISE: { proposalsPerMonth: 9999, aiDraftsPerMonth: 9999 },
};

export default async function SubscriptionPage() {
  const { organizationId } = await requireOrg();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [sub, proposalsThisMonth, aiDraftsThisMonth, code, invoiceResult] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    db.proposal.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
    db.aiDraft.count({ where: { organizationId, createdAt: { gte: monthStart } } }),
    getOrCreateMyReferralCode(),
    listSubscriptionInvoices(),
  ]);

  const [refUses, refConverted, refPending] = await Promise.all([
    db.referralConversion.count({ where: { codeId: code.id } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "CONVERTED" } }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PENDING" } }),
  ]);

  const plan: Plan = getOrgPlan(sub);
  const status = sub?.status ?? "FREE";
  const quotas = PLAN_QUOTAS[plan];

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/homeowners?ref=${code.code}`;
  const rewardSummary = `Earn ${money(code.rewardAmount)} ${
    code.rewardType === "CREDIT" ? "in credit" : code.rewardType.toLowerCase()
  } for every contractor who signs up`;

  return (
    <SubscriptionView
      plan={plan}
      status={status}
      nextBill={sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null}
      trialEndsAt={sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null}
      usage={{
        proposals: { used: proposalsThisMonth, limit: quotas.proposalsPerMonth },
        aiDrafts: { used: aiDraftsThisMonth, limit: quotas.aiDraftsPerMonth },
      }}
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
