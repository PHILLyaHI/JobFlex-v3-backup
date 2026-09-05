"use client";

// Viewport switch for /dashboard/reviews.
//
// One URL, two designs, both fed by the same loader (./load-reviews):
//   · above 768px — ReviewsContent, the blueprint desktop port, inside
//     BlueprintShell.
//   · at or below 768px — the handheld build in
//     app/(mobile)/mobile-reviews-v2/mobile-reviews, the same implementation
//     the preview route /mobile-reviews-v2 renders. One module, two entries.
//
// Before this switch existed (2026-09-03) the responsive shell mounted the
// handheld build PROPS-LESS from its HANDHELD_SURFACES map, so a phone saw the
// donor's eleven-record fixture (M. Henderson, 4.13 average) while a desk saw
// the org's real requests. The route now sits in the shell's PAGE_OWNED_STATIC
// set, which is the other half of this contract: below 768px the shell renders
// the page bare rather than wrapping this fixed-position tree in the desk
// chrome. Exactly one tree mounts.

import dynamic from "next/dynamic";
import { ReviewsContent } from "@/components/v3/reviews-blueprint/reviews-content";
import { HandheldHold, useIsHandheld } from "@/components/v3/responsive-shell/use-handheld";
import type { ReviewsProps } from "./load-reviews";

const MobileReviews = dynamic(
  () => import("@/app/(mobile)/mobile-reviews-v2/mobile-reviews").then((m) => m.MobileReviews),
  { ssr: false, loading: HandheldHold },
);

export function ReviewsResponsive(props: ReviewsProps) {
  const isHandheld = useIsHandheld();
  return isHandheld ? <MobileReviews {...props} /> : <ReviewsContent {...props} />;
}
