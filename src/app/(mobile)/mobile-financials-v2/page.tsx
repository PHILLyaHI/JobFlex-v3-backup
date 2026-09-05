// Mobile financials — mobile-financials-v2. A handheld-first rebuild of the
// Financials surface in the Blueprint design system, fourth sibling to
// /mobile-v2 (Overview), /mobile-proposals-v2 and /mobile-clients-v2. Lives
// beside the desktop financials page rather than replacing it, per the mobile
// route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, status tones, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, initials over generic glyphs, every
// state designed). Where the two disagree the house system wins — hard 3px
// offset shadows, 2px radii and Inter 900 caps stay, rather than the mobile
// skill's soft-shadow / rounded-3xl defaults.
//
// REAL DATA, NOT A FIXTURE. The component asks for the org's book itself, on
// mount, through the org-scoped `loadFinancials()` action — the same read
// /dashboard/financials makes on the desk — so this preview URL and the live
// one describe the same records and cannot drift.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes. The route key is a
// literal here — the shared V3_PORTED_ROUTES entry is added by the
// registration pass, not by this page.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileFinancials } from "./mobile-financials";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Financials · JobFlex Mobile",
  description:
    "Blueprint-edition mobile financials: revenue against expenses, margin, expenses, change orders and invoices.",
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

export default async function MobileFinancialsV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-financials-v2")}`);
  }

  return <MobileFinancials />;
}
