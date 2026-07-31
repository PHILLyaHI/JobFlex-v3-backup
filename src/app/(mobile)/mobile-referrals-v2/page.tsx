// Mobile referrals — mobile-referrals-v2. A handheld-first rebuild of the
// Referrals surface in the Blueprint design system, sibling to /mobile-v2
// (Overview), /mobile-proposals-v2, /mobile-clients-v2 and the rest of the
// handheld fleet. Lives beside the desktop /dashboard/referrals rather than
// replacing it, per the mobile route strategy.
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
// its own redirect-to-login like the other design routes. The route key is not
// in V3_PORTED_ROUTES yet, so the literal path is used here.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { MobileReferrals } from "./mobile-referrals";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Referrals · JobFlex Mobile",
  description:
    "Blueprint-edition mobile referrals: your code, the credit it has earned, and every contractor who used it.",
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

export default async function MobileReferralsV2Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-referrals-v2")}`);
  }

  return <MobileReferrals />;
}
