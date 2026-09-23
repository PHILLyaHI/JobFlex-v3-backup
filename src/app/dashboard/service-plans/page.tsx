import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { appBaseUrl } from "@/lib/appUrl";
import { loadPlansDashboard } from "@/lib/servicePlanBook";
import { ServicePlansContent } from "@/components/v3/service-plans-blueprint/service-plans-content";

// SERVICE PLANS (2026-09-22) — memberships: the plans the shop sells, its
// members, the visits and the bills. Session-scoped, never static.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · Service plans", description: "Maintenance plans: members, visits, billing, the plans you sell." };

export default async function ServicePlansPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    if (isLimitedRole(ctx.role)) redirect("/dashboard?error=forbidden");
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fservice-plans");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const [data, org, appUrl] = await Promise.all([
    loadPlansDashboard(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } }),
    appBaseUrl(),
  ]);
  return <ServicePlansContent data={data} timeZone={org?.timezone || "America/New_York"} appUrl={appUrl} />;
}
