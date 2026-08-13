"use client";

// Viewport switch for /dashboard/subscription.
//
// One URL, two designs: the existing desktop subscription view above 768px,
// the handheld rebuild at or below it. The switch is a MEDIA QUERY, never the
// user agent — the mobile-first rule forbids UA detection, and a query is also
// the only thing that makes DevTools' device toolbar work: drag the viewport
// under 768px and the surface swaps live, no reload and no second URL.
//
// WHY THE SWITCH LIVES IN THIS FOLDER rather than in
// components/v3/responsive-shell/responsive-dashboard-shell.tsx. That module
// is the BlueprintShell fleet's: it is mounted from src/app/dashboard/layout.tsx
// and keys handheld builds off the pathname of routes in THAT tree. This route
// is in the (dashboard) route group, a different layout that never mounts it —
// and its handheld build needs the page's server data, which cannot reach a
// props-less component mounted from a layout. So the page owns the switch, on
// the same (max-width: 768px) query and by the same four rules: one media
// query, exactly one tree mounted, a paper-coloured hold while the handheld
// chunk loads, and the mobile component IMPORTED out of the (mobile) group
// rather than copied.
//
// EXACTLY ONE TREE IS MOUNTED, never both. The handheld build is
// `position: fixed; inset: 0` and neutralises the host's body chrome from its
// own stylesheet; rendering it on top of a live desktop tree would strand the
// desktop scroll and leave the desktop plan buttons in the tab order under an
// opaque overlay.
//
// The DATA STAYS ON THE SERVER. This component is a switch and nothing else:
// every figure below arrives as props from the server page, which also owns the
// owner-only guard. Neither branch fetches.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { SubscriptionView, type SubscriptionViewProps } from "./subscription-view";

/** CLAUDE.md's handheld target: ≤768px. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Without it `dynamic` renders null and the swap
// blinks through to whatever is behind the app — which reads as a crash rather
// than a load. Inline styles on purpose: this has to paint before the handheld
// stylesheet has been fetched, which is also why the #f2f0eb drafting cream is
// written out rather than read from a token.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "#f2f0eb" }} />
);

// Imported out of the (mobile) group rather than copied, so /dashboard/
// subscription and /mobile-subscription-v2 cannot drift apart — one
// implementation, two entry points. Lazy and `ssr: false` so a desktop visitor
// never downloads the handheld bundle or its stylesheet for a tree they will
// not render.
const MobileSubscription = dynamic(
  () =>
    import("@/components/v3/mobile-subscription/mobile-subscription").then(
      (m) => m.MobileSubscription,
    ),
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
// corrects during hydration. A phone therefore shows desktop for one frame; the
// alternative — render nothing until mounted — flashes blank for every visitor
// on every viewport, which is a worse trade on a page people open to check a
// charge.
const getServerSnapshot = () => false;

export function SubscriptionResponsive(props: SubscriptionViewProps) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <MobileSubscription {...props} /> : <SubscriptionView {...props} />;
}
