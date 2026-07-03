import { requirePlatformAdmin } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { db } from "@/lib/db";
import { isStripeEnabled } from "@/lib/sdk/stripe";
import { parsePlanLimits } from "@/lib/planLimits";
import { PlansClient, type HydratedPlan, type SyncedInfo } from "./plans-client";

function parseFeatures(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

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
        description="Edit price, trial, and yearly options. Sync to Stripe to make a plan checkout-ready."
      />
      <PlansClient plans={hydrated} synced={synced} stripeEnabled={isStripeEnabled()} />
    </>
  );
}
