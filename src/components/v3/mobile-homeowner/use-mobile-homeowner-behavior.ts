"use client";

// MOBILE HOMEOWNER — the two behaviours that could not simply be imported from
// the desktop page's `use-homeowner-behavior.ts`.
//
// Everything else IS imported from there rather than duplicated, per CLAUDE.md
// → Component Reuse: `useReveal`, `useInViewOnce`, `useReducedMotion`,
// `prefersReducedMotion` and `safe` are viewport-agnostic and are shared with
// the desktop build. The wizard likewise reuses `homeowner-data.ts` verbatim
// (so the marketing copy cannot drift between the two builds) and
// `wizard/use-placeholder-cycle.ts`.
//
// The two exceptions:
//
// 1. `useBandParallax(id)` — the desktop `useNetParallax` hardcodes
//    `document.getElementById("net")`. `net` is a bare, document-global id and
//    this build namespaces every one of its ids, so the hook is re-expressed
//    with the id as an argument. Behaviour is otherwise identical: rAF-gated
//    passive scroll listener, the ±200px viewport cull, `--gy` written to the
//    band element (not to <html>) so `::before` / `::after` inherit it, and a
//    teardown that removes the listener, cancels the queued frame AND deletes
//    the custom property.
//
// 2. `useCountUp(seen)` — the desktop `NetCount` renders a `<tspan id="netCount">`.
//    Same easing (1 − (1 − p)³ over 1600ms), same "reduced motion snaps to the
//    final figure, because the number is information and is never withheld",
//    but returned as a value so the caller owns the markup and no global id is
//    minted.

import { useEffect, useState } from "react";
import { prefersReducedMotion, safe } from "../homeowner-landing/use-homeowner-behavior";

/** Drafting-grid drift behind an ink band. `scrollTop × 0.06`, per DESIGN.md. */
export function useBandParallax(elementId: string) {
  useEffect(() => {
    const teardown = safe("parallax:" + elementId, () => {
      const band = document.getElementById(elementId);
      if (!band || prefersReducedMotion()) return undefined;

      let pending = false;
      let frame = 0;

      const apply = () => {
        pending = false;
        const r = band.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
        band.style.setProperty("--gy", Math.round((window.innerHeight - r.top) * 0.06) + "px");
      };

      const onScroll = () => {
        if (pending) return;
        pending = true;
        frame = requestAnimationFrame(apply);
      };

      window.addEventListener("scroll", onScroll, { passive: true });
      apply();

      return () => {
        window.removeEventListener("scroll", onScroll);
        if (frame) cancelAnimationFrame(frame);
        band.style.removeProperty("--gy");
      };
    });
    return teardown;
  }, [elementId]);
}

const COUNT_TARGET = 2300;
const COUNT_DUR = 1600;

/**
 * The 2,300+ network figure. Returns the literal string to render.
 *
 * Ships `"0"` until the band has been seen — which cannot happen before mount —
 * so `toLocaleString` never runs on the server and there is no locale for
 * hydration to disagree about.
 */
export function useNetCountLabel(seen: boolean, reduced: boolean): string {
  const [p, setP] = useState(0);

  useEffect(() => {
    if (!seen || reduced) return;
    let frame = 0;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const progress = Math.min(1, (ts - t0) / COUNT_DUR);
      setP(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [seen, reduced]);

  if (!seen) return "0";
  const value = reduced ? COUNT_TARGET : Math.round(COUNT_TARGET * (1 - Math.pow(1 - p, 3)));
  return value.toLocaleString("en-US");
}
