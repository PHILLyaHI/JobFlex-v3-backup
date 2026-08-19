"use client";

// Viewport switch for /landing.
//
// One URL, two designs: the desktop blueprint landing above 768px, the handheld
// rebuild at or below it. Modelled on the house pattern in
// src/components/v3/responsive-shell/responsive-dashboard-shell.tsx — same
// media-query store, same single-tree rule, same lazy mobile chunk with a
// paper-coloured hold — but written here rather than there because that file
// switches DASHBOARD routes inside the blueprint app shell, and this route is a
// standalone (marketing) page that mounts no shell at all. Sharing it would
// have meant teaching a dashboard shell about a page that has no sidebar,
// no topbar and no session.
//
// THE SWITCH IS A MEDIA QUERY, NEVER THE USER AGENT. CLAUDE.md's mobile-first
// rule forbids UA detection outright, and a query is also the only thing that
// makes DevTools' device toolbar work: drag the viewport under 768px and the
// surface swaps live, with no reload and no second URL to remember.
//
// EXACTLY ONE TREE IS MOUNTED, NEVER BOTH. That matters more here than it looks.
// Both builds ship a sticky <nav> with a brand lockup and a "Get started" CTA,
// both paint their own graph-paper grids, and both neutralize globals.css's
// body grid and grain from inside their own stylesheet via `body:has(…)`.
// Rendering them together would give the page two navs, two `:has()` gates
// racing each other, and twenty-odd duplicate links in the tab order.
//
// The mobile component is IMPORTED, not copied — it is the same module
// /mobile-landing-v2 renders — so the preview URL and the live URL can never
// drift apart. It is lazy so a desktop visitor never downloads the handheld
// bundle at all.

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { LandingContent } from "@/components/v3/landing/landing-content";

/** CLAUDE.md's handheld target: <= 768px. */
const HANDHELD = "(max-width: 768px)";

// Paper-coloured full-bleed hold for the one chunk fetch that happens when the
// viewport first crosses 768px. Without it `dynamic` renders null and the swap
// blinks through to whatever is behind the app — which reads as a crash rather
// than a load. Inline styles on purpose: this has to paint before the
// stylesheet of the tree it is standing in for has been fetched, which is also
// why the #f2f0eb drafting cream is written out rather than read from a token.
const MobileHold = () => (
  <div style={{ position: "fixed", inset: 0, zIndex: 20, background: "#f2f0eb" }} />
);

const MobileLanding = dynamic(
  () => import("@/components/v3/mobile-landing/mobile-landing").then((m) => m.MobileLanding),
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
// corrects during hydration. A phone therefore shows the desktop tree for one
// frame; the alternative — render nothing until mounted — flashes blank for
// every visitor on every load, which on a marketing page is the worse trade.
const getServerSnapshot = () => false;

export function LandingResponsive() {
  const isHandheld = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return isHandheld ? <MobileLanding /> : <LandingContent />;
}
