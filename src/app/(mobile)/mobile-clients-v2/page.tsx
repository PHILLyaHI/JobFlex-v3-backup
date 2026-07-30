// Mobile clients — mobile-clients-v2. A handheld-first rebuild of the Clients
// surface in the Blueprint design system, third sibling to /mobile-v2 (Overview)
// and /mobile-proposals-v2 (Proposals). Lives beside the desktop
// /dashboard/clients rather than replacing it, per the mobile route strategy.
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, initials over generic glyphs).
// Where the two disagree the house system wins — hard 3px offset shadows, 2px
// radii and Inter 900 caps stay, rather than the mobile skill's soft-shadow /
// rounded-3xl defaults.
//
// This component also serves the LIVE /dashboard/clients URL at ≤768px through
// components/v3/responsive-shell/responsive-dashboard-shell.tsx, the same
// arrangement as its two siblings. There is one implementation with two entry
// points, so nothing has to be kept in sync.
//
// Content is the donor demo fixture by design: the data layer is out of scope
// until the layout is signed off.
//
// Auth: middleware only matches /dashboard and /admin, so this page enforces
// its own redirect-to-login like the other design routes.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { V3_PORTED_ROUTES } from "@/lib/v3/routes";
import { MobileClients } from "./mobile-clients";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clients · JobFlex Mobile",
  description: "Blueprint-edition mobile clients: the whole book, searchable, with open pipeline per account.",
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

export default async function MobileClientsV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent(V3_PORTED_ROUTES.mobileClientsV2)}`);
  }

  return <MobileClients />;
}
