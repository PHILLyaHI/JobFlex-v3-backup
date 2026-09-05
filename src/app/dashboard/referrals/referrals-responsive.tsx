"use client";

// Viewport switch for /dashboard/referrals.
//
// One URL, two designs, both fed by the same loader (./load-referrals):
//   · above 768px — ReferralsContent, the blueprint desktop port, inside
//     BlueprintShell (which supplies its `data-page` attribute and the
//     stylesheet keyed off it).
//   · at or below 768px — the handheld build in
//     app/(mobile)/mobile-referrals-v2/mobile-referrals, the same
//     implementation the preview route /mobile-referrals-v2 renders. Not a
//     copy: one module, two entry points.
//
// Before this switch existed (2026-09-03) the responsive shell mounted the
// handheld build PROPS-LESS from its HANDHELD_SURFACES map, so a phone saw the
// donor's demo fixture — BELL-4T9K and eight Seattle roofers — while a desk
// saw the org's real code. The route now sits in the shell's PAGE_OWNED_STATIC
// set, which is the other half of this contract: below 768px the shell renders
// the page bare rather than wrapping this fixed-position tree in the desk
// chrome.
//
// The switch is a MEDIA QUERY, never the user agent — the mobile-first rule
// forbids UA detection, and a query is also the only thing that makes DevTools'
// device toolbar work. Exactly one tree mounts: the handheld build is
// `position: fixed; inset: 0` and neutralises the host's body chrome from its
// own stylesheet.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { ReferralsContent } from "@/components/v3/referrals-blueprint/referrals-content";
import type { ReferralsProps } from "./load-referrals";

/** CLAUDE.md's handheld target: ≤768px. The same literal the shell uses. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Without it `dynamic` renders null and the swap
// blinks through to whatever is behind the app, which reads as a crash. Inline
// styles on purpose: this has to paint before the handheld stylesheet has been
// fetched, which is also why the #f2f0eb drafting cream is written out rather
// than read from a token.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "#f2f0eb" }} />
);

const MobileReferrals = dynamic(
  () =>
    import("@/app/(mobile)/mobile-referrals-v2/mobile-referrals").then((m) => m.MobileReferrals),
  { ssr: false, loading: MobileHold },
);

// Module scope so the identities are stable across renders — a fresh
// `subscribe` on every render makes useSyncExternalStore re-subscribe each
// time, which on a resize-driven store means tearing down the listener in the
// middle of the resize that triggered the render.
function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(HANDHELD);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}
const getSnapshot = () => window.matchMedia(HANDHELD).matches;
// The server cannot know the viewport, so it renders desktop and the client
// corrects during hydration — the same trade every other switch in the fleet
// makes, and for the same reason: rendering nothing until mounted flashes blank
// for every visitor on every viewport.
const getServerSnapshot = () => false;

export function ReferralsResponsive(props: ReferralsProps) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <MobileReferrals {...props} /> : <ReferralsContent {...props} />;
}
