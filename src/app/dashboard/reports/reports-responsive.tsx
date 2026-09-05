"use client";

// Viewport switch for /dashboard/reports.
//
// One URL, two designs, both fed by the same loader (./load-reports):
//   · above 768px — ReportsContent, the blueprint desktop port, inside
//     BlueprintShell.
//   · at or below 768px — the handheld build in
//     app/(mobile)/mobile-reports-v2/mobile-reports, the same implementation
//     the preview route /mobile-reports-v2 renders. One module, two entries.
//
// Before this switch existed (2026-09-03) the responsive shell mounted the
// handheld build PROPS-LESS from its HANDHELD_SURFACES map, so a phone saw the
// donor's demo fixture ($221,250 collected, Marcus Bell's crew) while a desk
// saw the org's real rollup. The route now sits in the shell's
// PAGE_OWNED_STATIC set, which is the other half of this contract: below 768px
// the shell renders the page bare rather than wrapping this fixed-position
// tree in the desk chrome. Exactly one tree mounts.

import dynamic from "next/dynamic";
import { ReportsContent } from "@/components/v3/reports-blueprint/reports-content";
import { HandheldHold, useIsHandheld } from "@/components/v3/responsive-shell/use-handheld";
import type { ReportsProps } from "./load-reports";

const MobileReports = dynamic(
  () => import("@/app/(mobile)/mobile-reports-v2/mobile-reports").then((m) => m.MobileReports),
  { ssr: false, loading: HandheldHold },
);

export function ReportsResponsive(props: ReportsProps) {
  const isHandheld = useIsHandheld();
  return isHandheld ? <MobileReports {...props} /> : <ReportsContent {...props} />;
}
