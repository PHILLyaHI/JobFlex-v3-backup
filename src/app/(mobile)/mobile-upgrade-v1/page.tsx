// MOBILE PLANS & UPGRADE — /mobile-upgrade-v1
//
// The direct-review entry point for the handheld build of /dashboard/upgrade:
// always the mobile design, at any width, so the composition can be opened on a
// desktop browser without resizing. The live URL keeps its own viewport switch
// (app/dashboard/upgrade/upgrade-responsive.tsx) and serves this SAME component
// at ≤768px — one implementation, two entry points.
//
// REAL DATA, NOT A FIXTURE. This route runs the same loader as the desktop
// page: the live catalog /admin/plans drives (getPlanCatalog — never a copy),
// the org's subscription row, its custom-plan pages, the Stripe mode switch,
// and the ?session_id return leg verified against Stripe under that same mode.
// The loader is DUPLICATED here rather than extracted, deliberately: the
// desktop page file is the behaviour of record for the live URL and this work
// is not permitted to restructure it.
//
// Auth: middleware only matches /dashboard and /admin, so this route enforces
// its own redirect-to-login like every other (mobile) design route.

import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { requireOrg, isOwnerRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { getStripeClient, isStripeEnabled } from "@/lib/sdk/stripe";
import { getStripeMode } from "@/lib/stripeMode";
import { SubscriptionStatus } from "@/lib/prismaEnums";
import { CUSTOM_PLAN_SLUG, normalizeCustomPages } from "@/lib/customPlan";
import { MobileUpgradeContent } from "@/components/v3/mobile-upgrade/mobile-upgrade";
import type { UpgradePlan } from "@/components/v3/upgrade-blueprint/upgrade-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Plans & upgrade · JobFlex Mobile",
  description: "Compare the plans, switch tiers, or build a custom plan page by page.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

/** Verify a checkout return and record the plan change. Returns the new plan
 *  slug, or null when the session is not this org's or not paid.
 *
 *  The same routine as the desktop page's, for the same reason: the live
 *  webhook cannot see sandbox events at all, and even live, the customer lands
 *  back here before the event does. */
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
    const trialEnd =
      sub && typeof sub !== "string" && sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    const periodEnd =
      sub && typeof sub !== "string" && sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null;
    const customerId = typeof session.customer === "string" ? session.customer : null;
    const status = trialEnd ? SubscriptionStatus.TRIALING : SubscriptionStatus.ACTIVE;
    // The old subscription ends here — the checkout route names the one this
    // purchase replaces. Best-effort: a failure leaves it for the admin's
    // reconcile, it never blocks the plan change that was paid for.
    const replaces = (session.metadata?.replacesSubId as string | undefined) || null;
    if (replaces && replaces !== subId) {
      await stripe.subscriptions
        .cancel(replaces, { prorate: false, invoice_now: false })
        .catch((err) => console.warn("[mobile-upgrade] could not cancel replaced sub:", err));
    }
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
    console.warn("[mobile-upgrade] checkout verify failed:", err);
    return null;
  }
}

export default async function MobileUpgradeV1Page({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; checkout?: string }>;
}) {
  let ctx: Awaited<ReturnType<typeof requireOrg>>;
  try {
    ctx = await requireOrg();
  } catch {
    redirect("/auth/login?next=%2Fmobile-upgrade-v1");
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
    <MobileUpgradeContent
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
