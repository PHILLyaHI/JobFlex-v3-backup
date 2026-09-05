// Mobile trade board — mobile-trade-v2. A handheld-first rebuild of the Trade
// board surface in the Blueprint design system, sibling to /mobile-v2
// (Overview), /mobile-clients-v2 (Clients) and the rest of the handheld fleet.
// Lives beside the desktop /dashboard/trade rather than replacing it, per the
// mobile route strategy — and since 2026-09-03 it is the SECOND entry point
// to the same build /dashboard/trade mounts at ≤768px (see
// app/dashboard/trade/trade-responsive.tsx).
//
// Built with the jobflex-page-styler skill (visual system: tokens, palette,
// type scale, Motion System "Balanced", FLUID SCALE) and the
// mobile-app-ui-design skill (structure: thumb zone, ≥44px targets, bottom
// sheets over modals, search over paging, initials over generic glyphs).
//
// Data: REAL. The same loader the desktop page runs
// (app/dashboard/trade/load-trade) reads the org's TradePost rows and hands
// them down as props; nothing here is a fixture. The loader also owns the auth
// ladder (login redirect, no-org), with this route as the return path.

import type { Metadata, Viewport } from "next";
import { loadTradeProps } from "@/app/dashboard/trade/load-trade";
import { MobileTrade } from "./mobile-trade";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trade board · JobFlex Mobile",
  description:
    "Blueprint-edition mobile trade board: postings from other contractors, searchable by category.",
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

export default async function MobileTradeV2Page() {
  const props = await loadTradeProps("/mobile-trade-v2");
  return <MobileTrade {...props} />;
}
