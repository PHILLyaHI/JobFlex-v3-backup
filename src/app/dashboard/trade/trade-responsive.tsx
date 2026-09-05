"use client";

// Viewport switch for /dashboard/trade.
//
// One URL, two designs, both fed by the same loader (./load-trade):
//   · above 768px — TradeContent, the blueprint desktop port, inside
//     BlueprintShell.
//   · at or below 768px — the handheld build in
//     app/(mobile)/mobile-trade-v2/mobile-trade, the same implementation the
//     preview route /mobile-trade-v2 renders. One module, two entries.
//
// Before this switch existed (2026-09-03) the responsive shell mounted the
// handheld build PROPS-LESS from its HANDHELD_SURFACES map, so a phone saw the
// donor's seven-post Seattle fixture while a desk saw the org's real board.
// The route now sits in the shell's PAGE_OWNED_STATIC set, which is the other
// half of this contract: below 768px the shell renders the page bare rather
// than wrapping this fixed-position tree in the desk chrome. Exactly one tree
// mounts.

import dynamic from "next/dynamic";
import { TradeContent } from "@/components/v3/trade-blueprint/trade-content";
import { HandheldHold, useIsHandheld } from "@/components/v3/responsive-shell/use-handheld";
import type { TradeProps } from "./load-trade";

const MobileTrade = dynamic(
  () => import("@/app/(mobile)/mobile-trade-v2/mobile-trade").then((m) => m.MobileTrade),
  { ssr: false, loading: HandheldHold },
);

export function TradeResponsive(props: TradeProps) {
  const isHandheld = useIsHandheld();
  return isHandheld ? <MobileTrade {...props} /> : <TradeContent {...props} />;
}
