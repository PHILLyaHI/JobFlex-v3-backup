// Mobile dashboard — mobile-v2. A handheld-first rebuild of the Overview
// surface in the Blueprint design system, living beside the desktop
// /dashboard rather than replacing it (per the mobile route strategy).
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced") and the mobile-app-ui-design skill
// (structure: thumb zone, ≥44px targets, bottom sheets over modals). Where the
// two disagree the house system wins — hard 3px offset shadows, 2px radii and
// Inter 900 caps stay, rather than the mobile skill's soft-shadow /
// rounded-3xl defaults.
//
// The donor demo fixture is gone. This page awaits the same org-scoped read
// the desktop Overview runs and hands it down as a prop, so the standalone
// review URL never pays for a client round trip. When the responsive shell
// mounts <MobileDashboard /> props-less at ≤768px on /dashboard, the component
// fetches the identical rows itself through `getDashboardData`.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import { buildDashboardData } from "@/app/dashboard/dashboard-data";
import type { DashboardData } from "@/components/v3/dashboard-blueprint/blueprint-data";
import { MobileDashboard } from "./mobile-dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overview · JobFlex Mobile",
  description: "Blueprint-edition mobile dashboard: today's money, today's schedule, and the next moves.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch/home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileV2Page() {
  let data: DashboardData;
  try {
    data = await buildDashboardData();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.mobileV2)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <MobileDashboard data={data} />;
}
