// Mobile fence estimator — mobile-fence-estimator-v2. A handheld-first rebuild
// of the desktop Fence studio (src/components/v3/fence-estimator-blueprint/*) in
// the Blueprint design system, sibling to /mobile-v2, /mobile-proposals-v2,
// /mobile-clients-v2 and the rest of the handheld fleet. It lives beside the
// desktop surface rather than replacing it, per the mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", fluid scale) and the mobile-app-ui-design
// skill (structure: thumb zone, ≥44px targets, bottom sheets over modals, one
// control per dimension). Where the two disagree the house system wins — hard
// 3px offset shadows, 2px radii and Inter 900 caps stay, rather than the mobile
// skill's soft-shadow / rounded-3xl defaults.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off. No Prisma, no server action, no network call.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces its
// own redirect-to-login like the other design routes.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileFenceEstimator } from "./mobile-fence-estimator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fence studio · JobFlex Mobile",
  description:
    "Blueprint-edition mobile fence estimator: the run drawn on graph paper, measured, priced live.",
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

export default async function MobileFenceEstimatorV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-fence-estimator-v2")}`);
  }

  return <MobileFenceEstimator />;
}
