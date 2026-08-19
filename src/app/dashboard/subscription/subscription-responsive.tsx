"use client";

// Viewport switch for /dashboard/subscription — the promoted Subscription URL
// the sidebar points at. Moved here from
// app/dashboard/subscription-blueprint/subscription-blueprint-responsive.tsx
// (2026-08-18) when the handheld half was folded into the promoted route; the
// staging route imports this same module, so there is still ONE switch.
//
// One URL, two designs, both of them the NEW ones:
//   · above 768px — SubscriptionContent, the blueprint desktop port, inside
//     BlueprintShell (which is what supplies its `data-page` attribute and the
//     stylesheet keyed off it, so this build cannot be moved to another layout).
//   · at or below 768px — the handheld build in
//     components/v3/mobile-subscription, the same implementation the preview
//     route /mobile-subscription-v2 renders. Not a copy: one module, three
//     entry points.
//
// The switch is a MEDIA QUERY, never the user agent — the mobile-first rule
// forbids UA detection, and a query is also the only thing that makes DevTools'
// device toolbar work. Exactly one tree mounts: the handheld build is
// `position: fixed; inset: 0` and neutralises the host's body chrome from its
// own stylesheet, so rendering it over a live desktop tree would strand the
// desktop scroll and leave the desktop controls in the tab order underneath.
// The other half of that contract is the guard in
// components/v3/responsive-shell/responsive-dashboard-shell.tsx, which stops
// wrapping this route in the desktop chrome below 768px.
//
// DATA. The handheld half is fed REAL figures — the page's server component
// runs the live subscription loader and hands them down as props, so nothing is
// fetched here. The desktop half is still the mockup's fixture, exactly as it
// was at this URL before; wiring it to the same loader is separate work and is
// deliberately not smuggled in here.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { SubscriptionContent } from "@/components/v3/subscription-blueprint/subscription-content";
import type { MobileSubscriptionProps } from "@/components/v3/mobile-subscription/mobile-subscription";

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
// corrects during hydration — the same trade every other switch in the fleet
// makes, and for the same reason: rendering nothing until mounted flashes blank
// for every visitor on every viewport.
const getServerSnapshot = () => false;

export function SubscriptionResponsive(props: MobileSubscriptionProps) {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <MobileSubscription {...props} /> : <SubscriptionContent />;
}
