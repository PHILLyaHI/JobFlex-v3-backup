// Mobile reports — mobile-reports-v2. A handheld-first rebuild of the Reports
// surface in the Blueprint design system, sibling to /mobile-v2 (Overview),
// /mobile-clients-v2, /mobile-proposals-v2 and the rest of the handheld family.
// Lives beside the desktop /dashboard/reports rather than replacing it, per the
// mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, touch scrub instead of hover). Where the two disagree the
// house system wins — hard 3px offset shadows, 2px radii and Inter 900 caps
// stay, rather than the mobile skill's soft-shadow / rounded-3xl defaults.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes. The route key is the
// literal path — V3_PORTED_ROUTES does not carry this surface yet.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-reports-v2")}`);
  }

  return <MobileReports />;
}
