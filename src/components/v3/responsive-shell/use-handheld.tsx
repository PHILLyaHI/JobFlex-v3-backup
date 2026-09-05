"use client";

// The one media-query switch every page-owned viewport switch reads.
//
// CLAUDE.md's handheld target is ≤768px, and the rule is a MEDIA QUERY, never
// the user agent — a query is also the only thing that makes DevTools' device
// toolbar work. The server cannot know the viewport, so the server snapshot is
// "desktop" and the client corrects during hydration: a phone shows the desk
// paint for one frame (hidden by the shell's `[data-desk-fallback]` rule). The
// alternative — render nothing until mounted — flashes blank for every visitor
// on every route, which is a worse trade.
//
// Before this module (2026-09-03) each switch carried its own copy of the
// subscribe / snapshot trio; subscription-responsive, upgrade-responsive and
// the referrals switch still do. New switches read this one.

import { useSyncExternalStore } from "react";

/** The same literal the responsive shell uses. */
export const HANDHELD = "(max-width: 768px)";

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
const getServerSnapshot = () => false;

export function useIsHandheld(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Paper-coloured full-bleed hold for the one chunk fetch that happens when the
 *  viewport first crosses 768px. Without it `dynamic` renders null and the swap
 *  blinks through to whatever is behind the app, which reads as a crash. Inline
 *  styles on purpose: this has to paint before the handheld stylesheet has been
 *  fetched, which is also why the #f2f0eb drafting cream is written out rather
 *  than read from a token. */
export function HandheldHold() {
  return <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "#f2f0eb" }} />;
}
