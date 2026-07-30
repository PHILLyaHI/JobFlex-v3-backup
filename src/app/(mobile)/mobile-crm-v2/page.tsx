// Mobile CRM — mobile-crm-v2. A handheld-first rebuild of the CRM surface in
// the Blueprint design system, fourth sibling to /mobile-v2 (Overview),
// /mobile-proposals-v2 (Proposals) and /mobile-clients-v2 (Clients). Lives
// beside the desktop /dashboard/crm rather than replacing it, per the mobile
// route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, initials over generic glyphs).
// Where the two disagree the house system wins — hard 3px offset shadows, 2px
// radii and Inter 900 caps stay, rather than the mobile skill's soft-shadow /
// rounded-3xl defaults.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes. The redirect target
// is the literal path — the V3_PORTED_ROUTES key for this surface is added by
// the route registration that follows this build.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileCrm } from "./mobile-crm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "CRM · JobFlex Mobile",
  description:
    "Blueprint-edition mobile CRM: pipeline conversion, the customer book, follow-up rules and the overdue queue.",
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

export default async function MobileCrmV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-crm-v2")}`);
  }

  return <MobileCrm />;
}
