// Handheld marketing landing — DIRECT PREVIEW ENTRY POINT.
//
// The same build that /landing serves at <= 768px, on a URL of its own so it
// can be reviewed at ANY viewport width without having to squeeze the browser
// under the breakpoint first. There is no second implementation: both entry
// points import `MobileLanding` from src/components/v3/mobile-landing/, so the
// preview and the live page cannot drift.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, 2px ink frames, hard 3px offset shadows, Motion System
// "Balanced") and the mobile-app-ui-design skill (structure: thumb zone,
// >= 44px targets, expose-don't-hide, peak-and-end). Where the two disagree the
// house system wins — hard shadows, 2px radii and Inter 900 caps stay, rather
// than the mobile skill's soft-shadow / rounded-3xl / glassmorphism defaults,
// all of which DESIGN.md names as anti-references.
//
// PUBLIC ROUTE. Unlike its (mobile) siblings this page enforces no auth: it is
// a marketing surface, and a signed-out visitor is exactly its audience. No
// data layer either — every figure on the page is static copy.

import type { Metadata, Viewport } from "next";
import { MobileLanding } from "@/components/v3/mobile-landing/mobile-landing";

// Metadata is the desktop landing's, verbatim, so the two entry points describe
// the same page to a crawler.
export const metadata: Metadata = {
  title: "JobFlex — Quote. Schedule. Get paid.",
  description:
    "The operating system for contractors — smart proposals, a clear lead pipeline, scheduling, client portals, and payments in one workspace.",
};

// Handheld build: read the layout at true device width and pay out the notch
// insets the gutters reserve.
//
// `maximumScale` is deliberately NOT set. Several older (mobile) pages pin it
// to 1, which suppresses pinch-zoom and fails WCAG 2.2 SC 1.4.4 (Resize Text).
// On a public marketing page read in direct sunlight that is the last thing to
// take away.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function MobileLandingV2Page() {
  return <MobileLanding />;
}
