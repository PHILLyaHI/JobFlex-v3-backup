// Mobile leads — mobile-leads-v2. A handheld-first rebuild of the Leads surface
// in the Blueprint design system, fourth sibling to /mobile-v2 (Overview),
// /mobile-proposals-v2 (Proposals) and /mobile-clients-v2 (Clients). Lives
// beside the desktop /dashboard/leads rather than replacing it, per the mobile
// route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, initials over a repeated glyph).
// Where the two disagree the house system wins — hard 3px offset shadows, 2px
// radii and Inter 900 caps stay, rather than the mobile skill's soft-shadow /
// rounded-3xl defaults.
//
// The topbar and hamburger drawer are NOT built here: they are the shared
// components/v3/mobile-shell/mobile-nav, rendered as the first child of the
// page's own `.app` grid — the same division of labour BlueprintShell has with
// the desktop pages.
//
// Content is REAL: the component reads the org's pipeline and its live Lead
// Center offers on mount through ./leads-source (the desktop sheet's own
// org-scoped query) and writes through the shared lead server actions. It is
// mounted here AND, at ≤768px, by the viewport switch on /dashboard/leads —
// which renders it with no props, which is why the read lives in the component
// rather than in this page.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes. The literal path is
// used rather than a V3_PORTED_ROUTES key, which the route registry does not
// carry yet.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileLeads } from "./mobile-leads";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leads · JobFlex Mobile",
  description:
    "Blueprint-edition mobile leads: the whole pipeline, searchable, with the stage board and the incoming inbox one tap away.",
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

export default async function MobileLeadsV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-leads-v2")}`);
  }

  return <MobileLeads />;
}
