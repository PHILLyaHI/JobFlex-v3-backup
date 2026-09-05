"use client";

// Viewport switch for /dashboard/phone.
//
// One URL, two designs, both fed by the same loader (./load-phone):
//   · above 768px — PhoneContent, the blueprint desktop port, inside
//     BlueprintShell.
//   · at or below 768px — the handheld build in
//     app/(mobile)/mobile-phone-v2/mobile-phone, the same implementation the
//     preview route /mobile-phone-v2 renders. One module, two entries.
//
// Before this switch existed (2026-09-03) the responsive shell mounted the
// handheld build PROPS-LESS from its HANDHELD_SURFACES map, so a phone saw the
// donor's ten-call fixture ((425) 555-0142, lead L-6041) while a desk saw the
// org's real log. The route now sits in the shell's PAGE_OWNED_STATIC set,
// which is the other half of this contract: below 768px the shell renders the
// page bare rather than wrapping this fixed-position tree in the desk chrome.
// Exactly one tree mounts.

import dynamic from "next/dynamic";
import { PhoneContent } from "@/components/v3/phone-blueprint/phone-content";
import { HandheldHold, useIsHandheld } from "@/components/v3/responsive-shell/use-handheld";
import type { PhoneProps } from "./load-phone";

const MobilePhone = dynamic(
  () => import("@/app/(mobile)/mobile-phone-v2/mobile-phone").then((m) => m.MobilePhone),
  { ssr: false, loading: HandheldHold },
);

export function PhoneResponsive(props: PhoneProps) {
  const isHandheld = useIsHandheld();
  return isHandheld ? <MobilePhone {...props} /> : <PhoneContent {...props} />;
}
