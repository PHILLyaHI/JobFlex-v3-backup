// Admin · Pricing plans — Blueprint edition.
//
// The catalog editor (source of truth for every plan surface) plus the promo
// code roster. The admin layout mounts the blueprint shell; this page renders
// only the `.content` children through components/v3/admin-plans.

import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isStripeEnabled } from "@/lib/sdk/stripe";
import { getStripeMode, stripeKeyFor } from "@/lib/stripeMode";
import { parsePlanLimits } from "@/lib/planLimits";
import { parseFeatures } from "@/lib/planCatalogServer";
import { describeCommission } from "@/lib/commission";
import {
  AdminPlansContent,
  type HydratedPlan,
  type SyncedInfo,
  type PromoDTO,
} from "@/components/v3/admin-plans/admin-plans-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex Admin · Plans",
  description: "Pricing plans, limits and Stripe sync — the source of truth for every plan surface.",
};

export default async function AdminPlansPage() {
  await requirePlatformAdmin();
  const [plans, planPrices, promoCodes] = await Promise.all([
    db.pricingPlan.findMany({ orderBy: { order: "asc" } }),
    db.planPrice.findMany({ where: { active: true } }),
    db.promoCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { influencer: { select: { displayName: true } } },
    }),
  ]);

  const hydrated: HydratedPlan[] = plans.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    yearlyPriceCents: p.yearlyPriceCents,
    trialDays: p.trialDays,
    interval: p.interval,
    order: p.order,
    features: parseFeatures(p.features),
    limits: parsePlanLimits(p.limitsJson),
    active: p.active,
    highlight: p.highlight,
  }));

  // Per-slug Stripe sync status for the synced/not-synced plate.
  const synced: Record<string, SyncedInfo> = {};
  for (const pp of planPrices) {
    const s = (synced[pp.planSlug] ??= { monthly: false, yearly: false });
    if (pp.interval === "MONTH") s.monthly = true;
    if (pp.interval === "YEAR") s.yearly = true;
  }

  const promos: PromoDTO[] = promoCodes.map((p) => ({
    id: p.id,
    code: p.code,
    influencerName: p.influencer.displayName,
    customerPercentOff: p.customerPercentOff,
    commission: describeCommission(p),
    active: p.active,
    clicks: p.clicks,
  }));

  return (
    <AdminPlansContent
      plans={hydrated}
      synced={synced}
      stripeEnabled={isStripeEnabled()}
      promos={promos}
      stripeMode={await getStripeMode()}
      stripeModes={{ live: Boolean(stripeKeyFor("live")), test: Boolean(stripeKeyFor("test")) }}
    />
  );
}
