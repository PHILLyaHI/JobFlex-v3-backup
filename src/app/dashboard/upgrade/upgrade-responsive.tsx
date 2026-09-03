"use client";

// Viewport switch for /dashboard/upgrade — the URL the upgrade gate, the
// sidebar's locked items and the subscription page all point at.
//
// One URL, two designs:
//   · above 768px — UpgradeContent, the desktop blueprint build, unchanged;
//   · at or below 768px — the handheld build in components/v3/mobile-upgrade,
//     the same implementation the preview route /mobile-upgrade-v1 renders.
//     Not a copy: one module, two entry points.
//
// The switch is a MEDIA QUERY, never the user agent — the mobile-first rule
// forbids UA detection, and a query is also the only thing that makes DevTools'
// device toolbar work. Exactly one tree is mounted: the handheld build is
// `position: fixed; inset: 0` and hides the desk chrome from its own stylesheet
// (see the host neutralisers in mobile-upgrade.css), so rendering it over a live
// desktop tree would strand the desktop scroll and leave the desktop controls
// in the tab order underneath.
//
// Modelled on the sibling switch in app/dashboard/subscription/
// subscription-responsive.tsx, with one difference worth writing down: that
// route is listed in responsive-dashboard-shell's PAGE_OWNED_STATIC, so at
// handheld width the shell renders it BARE. This route is not, and that module
// is out of scope for this work — so the handheld build renders INSIDE the desk
// shell and covers it. The neutralisers in mobile-upgrade.css are the other
// half of that arrangement; move this route into PAGE_OWNED_STATIC and they
// become inert on their own (they are `:has()`-gated on a shell that would no
// longer be there).
//
// DATA. Both halves are fed the SAME props by the page's server component —
// the live plan catalog, the org's plan, its custom pages, the owner flag and
// the verified checkout return. Nothing is fetched here.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { UpgradeContent } from "@/components/v3/upgrade-blueprint/upgrade-content";
import type { MobileUpgradeProps } from "@/components/v3/mobile-upgrade/mobile-upgrade";

/** CLAUDE.md's handheld target: ≤768px. The same literal the shell uses. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Without it `dynamic` renders null and the swap
// blinks through to whatever is behind the app, which reads as a crash. Inline
// styles on purpose: this has to paint before the handheld stylesheet has been
// fetched, which is also why the #f2f0eb drafting cream is written out rather
// than read from a token.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#f2f0eb" }} />
);

const MobileUpgrade = dynamic(
  () =>
    import("@/components/v3/mobile-upgrade/mobile-upgrade").then((m) => m.MobileUpgradeContent),
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

export function UpgradeResponsive(props: MobileUpgradeProps) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <MobileUpgrade {...props} /> : <UpgradeContent {...props} />;
}
