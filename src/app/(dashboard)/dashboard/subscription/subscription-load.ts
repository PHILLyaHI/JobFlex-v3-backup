import { isStripeEnabled } from "@/lib/sdk/stripe";
import { getStripeMode } from "@/lib/stripeMode";
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
import { customPriceCents, normalizeCustomPages } from "@/lib/customPlan";
import { REFERRAL_REWARD_PCT, settleReferralsForCode } from "@/lib/referralRewards";
import { getOrCreateMyReferralCode } from "@/actions/referrals";
import { listSubscriptionInvoices, type UpcomingInvoice } from "@/actions/billing";
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
  /** What the org has used on keys the plan does not cap — shown as counts. */
  usageUnlimited?: { resource: string; label: string; used: number }[];
  invoices: { available: boolean; invoices: SubscriptionInvoice[]; upcoming?: UpcomingInvoice | null };
  /** The next charge and what the org's referrals take off it; null when
   *  nothing is going to be billed (no subscription, no priced plan). */
  nextCharge: NextCharge | null;
  /** Pages a CUSTOM-plan org owns (lib/customPlan ids); [] otherwise. */
  customPages?: string[];
  /** What the embedded plan cards need to offer checkout (owner-only page). */
  checkoutReady: boolean;
  sandbox: boolean;
  referral: {
    code: string;
    rewardSummary: string;
    uses: number;
    converted: number;
    pending: number;
  };
}

/** The next bill as the Billing history card draws it (owner, 2026-09-14):
 *  when it is charged, what it comes to, and how much of it the people who
 *  used the org's referral code are paying for. */
export interface NextCharge {
  /** ISO date of the charge; null when Stripe has not scheduled one. */
  dueAt: string | null;
  /** The plan before anything comes off. */
  subtotalCents: number;
  /** Coupons on the subscription ("Referral coupon −$2.50"). */
  discountNotes: string[];
  discountCents: number;
  /** Referral credit taken off THIS bill. */
  referralCreditCents: number;
  /** How many referrals that credit comes from. */
  referralCount: number;
  /** Credit left over after this bill, carried to the next one. */
  creditLeftCents: number;
  /** What one more paid referral would take off (50% of a month). */
  perReferralCents: number;
  /** Signed up with the code, not subscribed yet. */
  pendingReferrals: number;
  /** What will actually be charged. */
  amountDueCents: number;
  /** True when Stripe could not preview the bill and it was worked out here. */
  estimated: boolean;
}

/** Stripe keeps one credit balance, not one credit per referral, so the
 *  referrals behind a credit are counted oldest-first: the newest rewards are
 *  the ones still unspent, and a bill spends the oldest of those first. */
function referralsBehind(rewardsNewestFirst: number[], balanceCents: number, spentCents: number): number {
  const unspent: number[] = [];
  let sum = 0;
  for (const cents of rewardsNewestFirst) {
    if (sum >= balanceCents) break;
    unspent.push(cents);
    sum += cents;
  }
  let count = 0;
  let used = 0;
  for (const cents of unspent.reverse()) {
    if (used >= spentCents) break;
    count += 1;
    used += cents;
  }
  return count;
}

export async function loadSubscriptionData(
  organizationId: string,
): Promise<SubscriptionViewProps> {
  const [sub, planContext, plans, limitUsage, code] = await Promise.all([
    db.subscription.findUnique({ where: { organizationId } }),
    getOrgPlanContext(organizationId),
    getPlanCatalog(),
    getOrgLimitUsage(organizationId),
    getOrCreateMyReferralCode(),
  ]);

  // Referral catch-up: a referred shop that has since started its
  // subscription flips the referrer's PENDING row and lands the credit.
  // BEFORE the invoice read, so the next-bill preview already nets it out.
  await settleReferralsForCode(code.id).catch(() => {});
  const invoiceResult = await listSubscriptionInvoices();

  // The custom plan's pages, for the matrix ticks and the hero price.
  let customPages: string[] = [];
  if ((sub?.plan ?? "").toUpperCase() === "CUSTOM") {
    const row = await db.syncState
      .findUnique({ where: { key: `orgPages:${organizationId}` } })
      .catch(() => null);
    try {
      customPages = normalizeCustomPages(row ? (JSON.parse(row.cursor) as string[]) : []);
    } catch {
      customPages = [];
    }
  }

  const [refUses, refConverted, refPending, earned] = await Promise.all([
    db.referralConversion.count({ where: { codeId: code.id } }),
    db.referralConversion.count({
      where: { codeId: code.id, status: { in: ["CONVERTED", "PAID"] } },
    }),
    db.referralConversion.count({ where: { codeId: code.id, status: "PENDING" } }),
    // Every referral that has earned (or is owed) a credit, newest first.
    db.referralConversion.findMany({
      where: { codeId: code.id, status: { in: ["CONVERTED", "PAID"] }, signupOrgId: { not: null } },
      select: { status: true, rewardCents: true, rewardAppliedAt: true },
      orderBy: [{ rewardAppliedAt: "desc" }, { createdAt: "desc" }],
    }),
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
  // The rest of the meters, so a plan with no caps still shows what it has
  // used this cycle instead of "nothing metered" (owner, 2026-09-02).
  const usageUnlimited = limitUsage
    .filter((u) => u.limit === null && u.used > 0)
    .map((u) => ({
      resource: u.resource,
      label: LIMIT_DEFS.find((d) => d.key === u.resource)?.label ?? u.resource,
      used: u.used,
    }));

  const stripeMode = await getStripeMode();
  const rewardSummary =
    "Each contractor who signs up with it and goes paid takes 50% off one month of your subscription";

  const priceCents = planDto
    ? planDto.priceCents
    : (sub?.plan ?? "").toUpperCase() === "CUSTOM"
      ? customPriceCents(customPages)
      : null;

  /* THE NEXT CHARGE (owner, 2026-09-14). Stripe's preview is the truth when
     there is one: it already nets out coupons and the credit balance, and the
     page only has to say which referrals that credit came from. Without one
     (no Stripe subscription yet, or the preview failed) the bill is worked
     out from the plan price and the credits not yet spent — marked estimated. */
  const perReferralCents = Math.round((priceCents ?? 0) * (REFERRAL_REWARD_PCT / 100));
  const paidRewards = earned
    .filter((r) => r.status === "PAID" && r.rewardAppliedAt)
    .map((r) => r.rewardCents ?? perReferralCents);
  const upcoming = invoiceResult.upcoming ?? null;
  const billable = ["ACTIVE", "TRIALING", "PAST_DUE"].includes(status.toUpperCase());
  let nextCharge: NextCharge | null = null;
  if (upcoming) {
    nextCharge = {
      dueAt: upcoming.dueAt ? new Date(upcoming.dueAt * 1000).toISOString() : null,
      subtotalCents: upcoming.subtotalCents,
      discountNotes: upcoming.notes,
      discountCents: upcoming.discountCents,
      referralCreditCents: upcoming.creditCents,
      referralCount: referralsBehind(paidRewards, upcoming.balanceCreditCents, upcoming.creditCents),
      creditLeftCents: Math.max(0, upcoming.balanceCreditCents - upcoming.creditCents),
      perReferralCents,
      pendingReferrals: refPending,
      amountDueCents: upcoming.amountDueCents,
      estimated: false,
    };
  } else if (billable && priceCents !== null && priceCents > 0) {
    // Unspent = owed (not on Stripe yet) + landed since the last invoice.
    const lastInvoiceAt = invoiceResult.invoices.reduce((t, v) => Math.max(t, v.created), 0) * 1000;
    const unspent = earned
      .filter((r) =>
        r.status === "CONVERTED"
          ? !r.rewardAppliedAt
          : !!r.rewardAppliedAt && r.rewardAppliedAt.getTime() > lastInvoiceAt,
      )
      .map((r) => r.rewardCents ?? perReferralCents);
    const balance = unspent.reduce((n, c) => n + c, 0);
    const credit = Math.min(priceCents, balance);
    nextCharge = {
      dueAt: sub?.currentPeriodEnd?.toISOString() ?? sub?.trialEndsAt?.toISOString() ?? null,
      subtotalCents: priceCents,
      discountNotes: [],
      discountCents: 0,
      referralCreditCents: credit,
      referralCount: referralsBehind(unspent, balance, credit),
      creditLeftCents: balance - credit,
      perReferralCents,
      pendingReferrals: refPending,
      amountDueCents: priceCents - credit,
      estimated: true,
    };
  }

  return {
    planName: planDto?.name ?? titleCaseSlug(rawPlan),
    priceCents,
    currentSlug: planDto?.slug ?? rawPlan.toLowerCase(),
    plans,
    status,
    nextBill: sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    trialEndsAt: sub?.trialEndsAt ? sub.trialEndsAt.toISOString() : null,
    usage,
    usageUnlimited,
    invoices: invoiceResult,
    nextCharge,
    customPages,
    checkoutReady: isStripeEnabled(),
    sandbox: stripeMode === "test",
    referral: {
      code: code.code,
      rewardSummary,
      uses: refUses,
      converted: refConverted,
      pending: refPending,
    },
  };
}
