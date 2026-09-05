// Mobile reviews — mobile-reviews-v2. A handheld-first rebuild of the Reviews
// surface in the Blueprint design system, sibling to /mobile-v2 (Overview),
// /mobile-proposals-v2, /mobile-clients-v2 and the rest of the handheld fleet.
// Lives beside the desktop /dashboard/reviews rather than replacing it, per the
// mobile route strategy — and since 2026-09-03 it is the SECOND entry point
// to the same build /dashboard/reviews mounts at ≤768px (see
// app/dashboard/reviews/reviews-responsive.tsx).
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb reach, ≥44px targets, bottom
// sheets over modals, exposed content over extra taps).
//
// Data: REAL. The same loader the desktop page runs
// (app/dashboard/reviews/load-reviews) reads the org's ReviewRequest rows and
// the jobs still eligible for a request, and hands them down as props; nothing
// here is a fixture. The loader also owns the auth ladder (login redirect,
// no-org), with this route as the return path.

import type { Metadata, Viewport } from "next";
import { loadReviewsProps } from "@/app/dashboard/reviews/load-reviews";
import { MobileReviews } from "./mobile-reviews";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reviews · JobFlex Mobile",
  description:
    "Blueprint-edition mobile reviews: the reputation feed, scored on a drawn meter, with the score spread and every request still awaiting a response.",
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

export default async function MobileReviewsV2Page() {
  const props = await loadReviewsProps("/mobile-reviews-v2");
  return <MobileReviews {...props} />;
}
