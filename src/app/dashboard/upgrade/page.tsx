// PLANS & UPGRADE — /dashboard/upgrade.
//
// The plans page for an org that ALREADY EXISTS — the one surface the app was
// missing: the signup plan step only runs inside registration, and
// /dashboard/subscription's plan strip was a static fixture. This page reads
// the SAME live catalog /admin/plans drives (getPlanCatalog — never a copy)
// and its CTAs open a real Stripe Checkout for the signed-in org via
// /api/checkout/subscription, which follows the admin's live/sandbox switch.
//
// It is also where the custom plan's upgrade gate points: a custom-plan org
// that opens a page it didn't buy lands on the gate, and the gate's one
// button lands here.
//
// THE RETURN LEG IS VERIFIED HERE, not by the webhook: checkout's success_url
// comes back with ?session_id, and this page retrieves the session under the
// SAME mode switch, checks it belongs to THIS org, and writes the plan change
// itself. The live webhook cannot see sandbox events at all, and even live,
// the customer lands here before the event does — same arrangement as the
// signup flow's completePendingSignup.

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { getStripeMode } from "@/lib/stripeMode";
import { isOwnerRole } from "@/lib/orgContext";
import { SubscriptionStatus } from "@/lib/prismaEnums";
import { CUSTOM_PLAN_SLUG, normalizeCustomPages } from "@/lib/customPlan";
import type { UpgradePlan } from "@/components/v3/upgrade-blueprint/upgrade-content";
// One URL, two designs: the desktop build above 768px, the handheld build in
// components/v3/mobile-upgrade at or below it. Same props, one loader — see
// upgrade-responsive.tsx.
import { UpgradeResponsive } from "./upgrade-responsive";

export const metadata = { title: "Plans & upgrade — JobFlex" };
export const dynamic = "force-dynamic";

/** Verify a checkout return and record the plan change. Returns the new plan
 *  slug, or null when the session is not this org's or not paid. */
async function verifyReturn(organizationId: string, sessionId: string): Promise<string | null> {
  try {
    const { stripe } = await getStripeClient();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription"],
    });
    if (session.metadata?.organizationId !== organizationId) return null;
    const paid = session.status === "complete" || session.payment_status === "paid";
    if (!paid) return null;
    const planSlug = (session.metadata?.planSlug as string | undefined) ?? null;
    if (!planSlug) return null;
    const sub = session.subscription;
    const subId = typeof sub === "string" ? sub : (sub?.id ?? null);
    const trialEnd = sub && typeof sub !== "string" && sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    const periodEnd =
      sub && typeof sub !== "string" && sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null;
    const customerId = typeof session.customer === "string" ? session.customer : null;
    // Canonical enum casing: the limits engine treated the old lowercase
    // "active"/"trialing" as LAPSED (free quotas for a paying customer).
    // currentPeriodEnd makes the row self-expiring should the webhook never
    // arrive (e.g. a sandbox-mode checkout the live webhook never sees).
    const status = trialEnd ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE;
    /* THE OLD SUBSCRIPTION ENDS HERE. The checkout route names the one this
       purchase replaces; it is cancelled at once, without a proration credit
       (the new plan starts now and was paid in full), so the org never bills
       twice. Best-effort: a failure here leaves the old sub for the admin's
       reconcile, it never blocks the plan change that was paid for. */
    const replaces = (session.metadata?.replacesSubId as string | undefined) || null;
    if (replaces && replaces !== subId) {
      await stripe.subscriptions
        .cancel(replaces, { prorate: false, invoice_now: false })
        .catch((err) => console.warn("[upgrade] could not cancel replaced subscription:", err));
    }
    // A custom plan's pages, for the page gate and the sidebar locks.
    if (planSlug === CUSTOM_PLAN_SLUG) {
      const pages = normalizeCustomPages(
        String(session.metadata?.customPages ?? "").split(",").filter(Boolean),
      );
      await db.syncState
        .upsert({
          where: { key: `orgPages:${organizationId}` },
          update: { cursor: JSON.stringify(pages) },
          create: { key: `orgPages:${organizationId}`, cursor: JSON.stringify(pages) },
        })
        .catch(() => {});
    }
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
    return planSlug;
  } catch (err) {
    console.warn("[upgrade] checkout verify failed:", err);
    return null;
  }
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; checkout?: string }>;
}) {
  let ctx: Awaited<ReturnType<typeof requireOrg>>;
  try {
    ctx = await requireOrg();
  } catch {
    redirect("/auth/login?next=%2Fdashboard%2Fupgrade");
  }

  const params = await searchParams;
  const upgradedTo = params.session_id
    ? await verifyReturn(ctx.organizationId, params.session_id)
    : null;

  const [catalog, sub, mode] = await Promise.all([
    getPlanCatalog(),
    db.subscription.findUnique({
      where: { organizationId: ctx.organizationId },
      select: { plan: true, status: true },
    }),
    getStripeMode(),
  ]);

  // The pages a custom-plan org owns, for the "add a page" card.
  let customPages: string[] = [];
  if ((sub?.plan ?? "").toUpperCase() === "CUSTOM") {
    const row = await db.syncState
      .findUnique({ where: { key: `orgPages:${ctx.organizationId}` } })
      .catch(() => null);
    try {
      customPages = normalizeCustomPages(row ? (JSON.parse(row.cursor) as string[]) : []);
    } catch {
      customPages = [];
    }
  }

  const plans: UpgradePlan[] = catalog
    .filter((p) => !p.isFree)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      yearlyPriceCents: p.yearlyPriceCents,
      trialDays: p.trialDays,
      features: p.features,
      highlight: p.highlight,
    }));

  return (
    <UpgradeResponsive
      plans={plans}
      currentPlan={sub?.plan ?? null}
      customPages={customPages}
      isOwner={isOwnerRole(ctx.role)}
      checkoutReady={isStripeEnabled()}
      sandbox={mode === "test"}
      upgradedTo={upgradedTo}
      cancelled={params.checkout === "cancelled"}
    />
  );
}
