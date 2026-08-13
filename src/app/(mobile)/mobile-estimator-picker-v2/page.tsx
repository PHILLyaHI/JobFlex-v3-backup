// Estimator picker — review harness. /mobile-estimator-picker-v2
//
// A preview route for a surface that has no route of its own: the estimator
// picker is a dialog mounted in both shells and opened by a document event, so
// there is no URL that puts it on screen. This is that URL.
//
// Built with the jobflex-page-styler skill (tokens, palette, type scale, Motion
// System "Balanced") and the mobile-app-ui-design skill (bottom sheet over
// modal, ≥44px targets, primary actions in the thumb zone). Where the two
// disagree the house system wins — hard 3px offset shadows, 2px radii and Inter
// 900 caps stay, not the mobile skill's soft-shadow / rounded-3xl defaults.
//
// NOT AUTH-GATED, unlike the rest of the (mobile) fleet, and that is the whole
// point of it. The fleet's pages redirect to /auth/login, dev.db carries no
// seed account, and a review harness that answers 307 reviews nothing. It also
// has nothing to gate: the picker's roster is a static fixture in
// estimators-data.ts — no session, no org, no query, no server action. The four
// destinations it links to are gated on their own, as they were before.

import type { Metadata, Viewport } from "next";
import { EstimatorPickerHarness } from "./picker-harness";

export const metadata: Metadata = {
  title: "Estimator picker · JobFlex Mobile",
  description:
    "Review harness for the blueprint estimator picker: the New Estimate dialog as a handheld bottom sheet, 320–768px.",
};

// Handheld build: true device width and the notch / home-indicator insets the
// sheet pays out through env(safe-area-inset-bottom).
//
// No `maximumScale`. Pinch-zoom is an accessibility affordance and this surface
// carries the smallest type in the system — the drawing-annotation layer inside
// the cards' blueprint plates. Locking the scale would take away the only way
// to read it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function MobileEstimatorPickerV2Page() {
  return <EstimatorPickerHarness />;
}
