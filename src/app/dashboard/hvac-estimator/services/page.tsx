import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { getHvacRateCard } from "@/actions/hvacEstimator";
import { locationIndex } from "@/lib/estimate/location-index";
import { HvacServicesContent } from "@/components/v3/hvac-services-blueprint/hvac-services-content";

// THE HVAC SERVICE MENU (2026-09-23) — the estimator's price book as a page.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · HVAC service menu", description: "Every task the HVAC service visit prices, in your market." };

export default async function HvacServicesPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    if (isLimitedRole(ctx.role)) redirect("/dashboard?error=forbidden");
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fhvac-estimator%2Fservices");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const [{ card }, org] = await Promise.all([getHvacRateCard(), db.organization.findUnique({ where: { id: organizationId }, select: { address: true } })]);
  const idx = locationIndex(org?.address ?? "");
  return <HvacServicesContent card={card} factor={idx.factor} place={idx.place} />;
}
