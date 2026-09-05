// (mobile) group layout — the SAME two gates the dashboard layouts carry,
// applied to the standalone handheld URLs.
//
// Until this existed, /mobile-* and /trade-services sat outside the middleware
// matcher and had no group layout: each page checked only "is there a
// session", so an INSTALLER blocked from /dashboard/company on desktop could
// open /mobile-company-v2 and read the company profile, and a custom-plan org
// that never bought a page could open its handheld twin. The role gate and the
// custom-plan page gate are keyed on /dashboard/* paths, so every handheld URL
// is mapped to the desktop route it mirrors and gated on that.
//
// Public surfaces (landing, homeowner intake, the customer's proposal view,
// the auth screens, the estimator picker) have no twin and pass straight
// through; a signed-out visitor to a gated page also passes through — the
// page's own redirect-to-login handles them, exactly as the dashboard layouts
// do.

import type { ReactNode } from "react";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/orgContext";
import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";
import { getBlockedCustomPages } from "@/lib/customPageAccess";
import { isCustomBlockedPath } from "@/lib/customPlan";
import { UpgradeGate } from "@/components/v3/upgrade-gate/upgrade-gate";

/** Handheld URL prefix → the desktop route whose gates apply. */
const DESKTOP_TWIN: Record<string, string> = {
  "/mobile-v2": "/dashboard",
  "/mobile-proposals-v2": "/dashboard/proposals",
  "/mobile-clients-v2": "/dashboard/clients",
  "/mobile-leads-v2": "/dashboard/leads",
  "/mobile-projects-v2": "/dashboard/projects",
  "/mobile-project-detail-v2": "/dashboard/projects",
  "/mobile-crm-v2": "/dashboard/crm",
  "/mobile-calendar-v2": "/dashboard/calendar",
  "/mobile-jobs-v2": "/dashboard/jobs",
  "/mobile-job-detail-v1": "/dashboard/jobs",
  "/mobile-workers-v2": "/dashboard/workers",
  "/mobile-hire-v1": "/dashboard/hire",
  "/mobile-company-v2": "/dashboard/company",
  "/mobile-financials-v2": "/dashboard/financials",
  "/mobile-overhead-v1": "/dashboard/financials",
  "/mobile-advanced-ai-v2": "/dashboard/advanced-ai",
  "/mobile-smart-estimate-v1": "/dashboard/advanced-ai",
  "/mobile-video-estimator-v1": "/dashboard/advanced-ai",
  "/mobile-roof-estimator-v2": "/dashboard/roof-estimator",
  "/mobile-fence-estimator-v2": "/dashboard/fence-estimator",
  "/mobile-phone-v2": "/dashboard/phone",
  "/mobile-messages-v2": "/dashboard/messages",
  "/mobile-reviews-v2": "/dashboard/reviews",
  "/mobile-trade-v2": "/dashboard/trade",
  "/trade-services": "/dashboard/trade",
  "/mobile-referrals-v2": "/dashboard/referrals",
  "/mobile-reports-v2": "/dashboard/reports",
  "/mobile-manual-builder-v2": "/dashboard/estimators/manual",
  "/mobile-subscription-v2": "/dashboard/subscription",
};

function desktopTwin(pathname: string): string | null {
  let best: string | null = null;
  for (const prefix of Object.keys(DESKTOP_TWIN)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best.length) best = prefix;
    }
  }
  return best ? DESKTOP_TWIN[best] : null;
}

export default async function MobileGroupLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const twin = desktopTwin(pathname);
  if (!twin) return children;

  let role: string | null = null;
  let organizationId: string | null = null;
  try {
    const ctx = await requireOrg();
    role = ctx.role;
    organizationId = ctx.organizationId;
  } catch {
    // Signed out, or no membership yet — the page redirects to login itself.
    return children;
  }

  // Fail-closed role gate: a role WITH a gate is bounced home when the twin
  // route is outside its allowed surfaces.
  const gate = role ? ROLE_ROUTE_GATES[role] : undefined;
  if (gate && !isPathAllowed(gate, twin)) redirect(gate.home as Route);

  // Custom-plan page gate: render the upgrade offer instead of the page.
  const lockedPages = organizationId
    ? await getBlockedCustomPages(organizationId).catch(() => getBlockedCustomPages(organizationId!))
    : null;
  if (lockedPages?.length && isCustomBlockedPath(lockedPages, twin)) {
    return <UpgradeGate pathname={twin} />;
  }

  return children;
}
