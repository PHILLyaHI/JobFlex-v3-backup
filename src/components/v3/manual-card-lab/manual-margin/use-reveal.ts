"use client";

// PRICE FIRST — mount contract. (route: /dashboard/manual-margin)
//
// A local copy of the fleet's reveal cascade rather than an import from
// another variant's folder: this lab keeps every variant self-contained inside
// its own directory, and the cascade is nine lines. The SHARED piece —
// useBlueprintContent, the layout-effect timing that stops the paint-then-snap
// navigation glitch — is shell infrastructure and is imported from the shell,
// exactly like every other blueprint page does.
//
// The classes are the fleet's literal `.rv` / `.rv-in`, which the ALWAYS-ON
// dashboard and proposals modules style under `.bp :global(...)` on the shell
// root — so the cascade works even though this route is deliberately absent
// from the shell's PAGE_STYLES map (see the scoping note at the top of
// manual-margin.module.css).
//
// Every block the content component returns is a DIRECT child of `.content`,
// which is what this walks. The sticky reconciliation strip is one of them:
// `.rv` parks it at translateY(14px) for its 60ms slot and then sets
// `transform: none`, and a sticky box with no transform sticks normally.

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
