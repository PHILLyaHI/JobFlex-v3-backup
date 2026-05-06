"use client";
import * as React from "react";
import { MEDIA_QUERIES } from "@/lib/breakpoints";

/**
 * SSR-safe boolean: `true` when viewport ≤ 767px.
 *
 * IMPORTANT — first-render behavior:
 *   Returns `false` on the server AND on the first client render so SSR markup
 *   matches and React does not log a hydration warning. The real value is
 *   committed in a `useEffect`, which means a brief render-cycle flicker is
 *   possible on actual mobile viewports (one frame of "desktop" markup before
 *   the effect runs). This is intentional for Phase 0.
 *
 *   Phase 1+ consumers (nav shell, layout switchers) MUST account for this.
 *   Pick one of:
 *     1. CSS-first layout (Tailwind `block md:hidden` style, no JS gating).
 *     2. Render a stable skeleton until `useIsMobile()` settles.
 *     3. Read `window.matchMedia` synchronously inside the effect before paint.
 *   Do NOT branch top-level layout on `useIsMobile()` without one of those.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia(MEDIA_QUERIES.mobile);
    setIsMobile(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
