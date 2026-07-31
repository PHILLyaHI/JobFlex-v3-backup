"use client";

// The fleet's mount contract for the two React-authored estimator pages.
//
// The 22 ported pages get their reveal from a `*-behavior.ts` DOM script that
// the donor shipped with. These two have no donor, so the cascade lives here:
// same classes (.rv / .rv-in), same stagger, and the same layout-effect timing
// through useBlueprintContent — which matters, because under a plain useEffect
// the browser paints the new page fully opaque before the classes land and the
// whole thing snaps back and fades in. That double take is the navigation
// glitch the shared hook exists to prevent.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

export function useReveal() {
  // Referentially stable for the life of the mount: useBlueprintContent re-runs
  // — and replays the whole cascade — on every identity change of `init`.
  const init = useCallback((content: HTMLElement) => {
    const blocks = Array.from(content.children) as HTMLElement[];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      blocks.forEach((b) => b.classList.add("rv", "rv-in"));
      return () => blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
    }

    blocks.forEach((b) => b.classList.add("rv"));
    const timers = blocks.map((b, i) =>
      window.setTimeout(() => b.classList.add("rv-in"), 60 + i * 70),
    );

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
    };
  }, []);

  useBlueprintContent(init);
}
