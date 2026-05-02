import { requireUser } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { db } from "@/lib/db";
import { PlansClient } from "./plans-client";

interface HydratedPlan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  interval: string;
  order: number;
  features: string[];
}

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
  await requireUser();
  const plans = await db.pricingPlan.findMany({ orderBy: { order: "asc" } });
  const hydrated: HydratedPlan[] = plans.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    interval: p.interval,
    order: p.order,
    features: parseFeatures(p.features),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Pricing plans"
        description="Public-facing price tiers shown on the /pricing page. Enforcement is driven separately by the Subscription.plan code table."
      />
      <PlansClient plans={hydrated} />
    </>
  );
}
