// /pricing — the landing's design, the catalog's numbers.
//
// The page body lives in components/v3/pricing-d so the route stays a thin data
// read. Plans come from the same catalog every other plan surface reads; the
// custom plan's trial comes from the value /admin/plans writes.

import type { Metadata } from "next";
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { getCustomPlanTrialDays } from "@/lib/customPlanConfig";
import { PricingPage } from "@/components/v3/pricing-d/pricing-page";

// ISR backstop — instant propagation comes from revalidatePlanSurfaces() firing
// on every admin plan write; this window only covers out-of-band DB edits.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Pricing — JobFlex",
  description:
    "Plans for small-shop contractors, or build your own from the pages you actually open. Unlimited clients and the client portal on every plan.",
};

export default async function Page() {
  const [plans, customTrialDays] = await Promise.all([
    getPlanCatalog(),
    getCustomPlanTrialDays(),
  ]);
  return <PricingPage plans={plans} customTrialDays={customTrialDays} />;
}
