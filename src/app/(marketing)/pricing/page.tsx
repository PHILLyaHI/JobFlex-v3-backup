// /pricing — the landing's design, the catalog's numbers.
//
// The page body lives in components/v3/pricing-d so the route stays a thin data
// read. Plans come from the same catalog every other plan surface reads; the
// custom plan's trial comes from the value /admin/plans writes.

import type { Metadata } from "next";
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { PricingPage } from "@/components/v3/pricing-d/pricing-page";
import { signupTrialMode } from "@/lib/trialPolicyServer";
import { customPlanOffered } from "@/lib/customPlanFlag";

// RENDERED PER REQUEST (owner, 2026-10-07). It used to be ISR (an hour), so
// the server-side flags it reads — CUSTOM_PLAN_ENABLED (lib/customPlanFlag)
// and the trial's card (lib/trialPolicyServer signupTrialMode) — were baked into the prerender
// at build time and showed whatever the environment said THEN until the page
// regenerated. The landing, which shows the same plans and flags, has always
// been dynamic; this page now matches it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing — JobFlex",
  description:
    "Plans for small-shop contractors, or build your own from the pages you actually open. Unlimited clients and the client portal on every plan.",
};

export default async function Page() {
  const plans = await getPlanCatalog();
  return (
    <PricingPage
      plans={plans}
      requiresCard={(await signupTrialMode()) === "card"}
      customOffered={customPlanOffered()}
    />
  );
}
