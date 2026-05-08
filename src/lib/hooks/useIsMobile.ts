"use client";
import * as React from "react";
import { MEDIA_QUERIES } from "@/lib/breakpoints";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || !("matchMedia" in window)) {
    return () => {};
  }
  const mql = window.matchMedia(MEDIA_QUERIES.mobile);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !("matchMedia" in window)) {
    return false;
  }
  return window.matchMedia(MEDIA_QUERIES.mobile).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * SSR-safe boolean: `true` when viewport ≤ 767px.
 *
 * Uses `useSyncExternalStore`, the React 18+ primitive purpose-built for
 * external store subscriptions like `matchMedia`. Returns `false` during
 * SSR and on the first commit so SSR markup matches and React does not
 * log a hydration warning, then settles to the real value without a
 * setState-in-effect cascade (avoids the `react-hooks/set-state-in-effect`
 * rule from eslint-plugin-react-hooks v7).
 *
 * IMPORTANT — Phase 1+ consumers (nav shell, layout switchers) MUST account
 * for the brief render-cycle settle on real mobile viewports (one frame of
 * "desktop" markup before the snapshot commits). Pick one of:
 *   1. CSS-first layout (Tailwind `block md:hidden` style, no JS gating).
 *   2. Render a stable skeleton until `useIsMobile()` settles.
 *   3. Read `window.matchMedia` synchronously inline before paint.
 * Do NOT branch top-level layout on `useIsMobile()` without one of those.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
