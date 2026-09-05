// Mobile reports — mobile-reports-v2. A handheld-first rebuild of the Reports
// surface in the Blueprint design system, sibling to /mobile-v2 (Overview),
// /mobile-clients-v2, /mobile-proposals-v2 and the rest of the handheld family.
// Lives beside the desktop /dashboard/reports rather than replacing it, per the
// mobile route strategy — and since 2026-09-03 it is the SECOND entry point to
// the same build /dashboard/reports mounts at ≤768px (see
// app/dashboard/reports/reports-responsive.tsx).
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, touch scrub instead of hover).
//
// Data: REAL. The same loader the desktop page runs
// (app/dashboard/reports/load-reports) computes the org's rollup and hands it
// down as props; nothing here is a fixture. The loader also owns the auth
// ladder (login redirect, no-org), with this route as the return path.

import type { Metadata, Viewport } from "next";
import { loadReportsProps } from "@/app/dashboard/reports/load-reports";
import { MobileReports } from "./mobile-reports";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reports · JobFlex Mobile",
  description:
    "Blueprint-edition mobile reports: collected against invoiced, the pipeline funnel, conversion and crew delivery — over any range.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileReportsV2Page() {
  const props = await loadReportsProps("/mobile-reports-v2");
  return <MobileReports {...props} />;
}
