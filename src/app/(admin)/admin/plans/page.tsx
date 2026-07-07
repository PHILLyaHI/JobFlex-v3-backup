import { requirePlatformAdmin } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { isStripeEnabled } from "@/lib/sdk/stripe";
import { parsePlanLimits } from "@/lib/planLimits";
import { parseFeatures } from "@/lib/planCatalogServer";
import { PlansClient, type HydratedPlan, type SyncedInfo } from "./plans-client";

export default async function AdminPlansPage() {
  await requirePlatformAdmin();
  const [plans, planPrices] = await Promise.all([
    db.pricingPlan.findMany({ orderBy: { order: "asc" } }),
    db.planPrice.findMany({ where: { active: true } }),
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

  // Per-slug Stripe sync status for the synced/not-synced badge.
  const synced: Record<string, SyncedInfo> = {};
  for (const pp of planPrices) {
    const s = (synced[pp.planSlug] ??= { monthly: false, yearly: false });
    if (pp.interval === "MONTH") s.monthly = true;
    if (pp.interval === "YEAR") s.yearly = true;
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Pricing plans"
        description="The source of truth for every plan surface — pricing page, subscription page, checkout, and limits. Price changes sync to Stripe automatically."
      />
      <PlansClient plans={hydrated} synced={synced} stripeEnabled={isStripeEnabled()} />
    </>
  );
}
