"use client";

// IS THIS A PHONE? — the manual builder's own viewport switch.
//
// This page is served at ONE url on both viewports: above 768px the desktop
// blueprint shell wraps it, at or below it ResponsiveDashboardShell wraps the
// same markup in BlueprintHandheldFrame. Most of the column reads fine at
// 390px, but two of its eleven cards do not — the priced table (card 03) and
// the paper controls (card 11) — and those two get a handheld build of their
// own rather than a squeezed copy of the desk one.
//
// A MEDIA QUERY, never the user agent: CLAUDE.md's mobile-first rule forbids UA
// detection, and a query is also the only thing that makes DevTools' device
// toolbar work — drag the viewport under 768px and the two cards swap live.
// Same breakpoint and the same useSyncExternalStore shape the shell itself
// uses, deliberately: one definition of "handheld" in the app.
//
// The server cannot know the viewport, so it renders the DESK build and the
// client corrects during hydration — the same trade the shell makes, for the
// same reason: rendering nothing until mounted would flash a blank card for
// every visitor on every load.

import { useSyncExternalStore } from "react";

/** CLAUDE.md's handheld target, matching ResponsiveDashboardShell. */
const HANDHELD = "(max-width: 768px)";

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

export function useHandheld(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
