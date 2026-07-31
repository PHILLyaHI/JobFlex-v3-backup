// Mobile roof estimator — mobile-roof-estimator-v2. A handheld-first rebuild of
// the Roof estimator surface in the Blueprint design system, sibling to
// /mobile-v2 (Overview), /mobile-proposals-v2 and /mobile-clients-v2. Lives
// beside the desktop /dashboard/roof-estimator rather than replacing it, per the
// mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced") and the mobile-app-ui-design skill
// (structure: thumb zone, ≥44px targets, bottom sheets over modals, expose
// don't hide). Where the two disagree the house system wins — hard 3px offset
// shadows, 2px radii and Inter 900 caps stay, rather than the mobile skill's
// soft-shadow / rounded-3xl defaults.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off. There is no map, no geocoder and no network
// call of any kind — the roof is an inline SVG drawn from the fixture geometry.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileRoofEstimator } from "./mobile-roof-estimator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Roof estimator · JobFlex Mobile",
  description:
    "Blueprint-edition mobile roof estimator: a drawn roof plan, facet and linear-footage measurements, and a priced takeoff.",
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

export default async function MobileRoofEstimatorV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-roof-estimator-v2")}`);
  }

  return <MobileRoofEstimator />;
}
