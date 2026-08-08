"use client";

// The fleet's mount contract, carried locally rather than imported from a
// sibling lab folder — the lab convention is that every folder owns its own
// copy, so no variant's in-flight edit can break another page's entrance.
//
// Same classes (.rv / .rv-in, published always-on by the dashboard module),
// same stagger, and the same layout-effect timing through useBlueprintContent:
// under a plain useEffect the browser paints the new page fully opaque before
// the classes land, and the whole thing snaps back and fades in. That double
// take is the navigation glitch the shared hook exists to prevent.

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
