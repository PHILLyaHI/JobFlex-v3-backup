// Mobile referrals — mobile-referrals-v2. A handheld-first rebuild of the
// Referrals surface in the Blueprint design system, sibling to /mobile-v2
// (Overview), /mobile-proposals-v2, /mobile-clients-v2 and the rest of the
// handheld fleet. Lives beside the desktop /dashboard/referrals rather than
// replacing it, per the mobile route strategy — and since 2026-09-03 it is
// the SECOND entry point to the same build /dashboard/referrals mounts at
// ≤768px (see app/dashboard/referrals/referrals-responsive.tsx).
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, initials over generic glyphs).
//
// Data: REAL. The same loader the desktop page runs (app/dashboard/referrals/
// load-referrals) reads the org's ReferralCode and ReferralConversion rows and
// hands them down as props; nothing here is a fixture. The loader also owns
// the auth ladder (login redirect, no-org, limited role), with this route as
// the return path.

import type { Metadata, Viewport } from "next";
import { loadReferralsProps } from "@/app/dashboard/referrals/load-referrals";
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
  const props = await loadReferralsProps("/mobile-referrals-v2");
  return <MobileReferrals {...props} />;
}
