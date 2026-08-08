"use client";

// WORKLIST — mount contract. A local copy of the fleet's reveal cascade rather
// than an import from another lab folder: every variant in this lab is
// self-contained inside its own directory, and the cascade is nine lines.
//
// The SHARED piece — `useBlueprintContent`, the layout-effect timing that stops
// the paint-then-snap navigation glitch, plus the `.main` scroll reset — is
// shell infrastructure and is imported from the shell, like every page does.
//
// The classes are the fleet's literal `.rv` / `.rv-in`, which the ALWAYS-ON
// dashboard + proposals modules style under `.bp :global(...)` on the shell
// root. They therefore work even though this page is deliberately absent from
// PAGE_STYLES (see the scoping note at the top of manual-worklist.module.css).
//
// Every block the content component returns is a DIRECT child of `.content`,
// which is what this walks — four of them, so the whole cascade lands in
// 60 + 3×70 = 270ms. The sticky ledger is one of those children: `.rv` parks it
// at translateY(14px) for its slot and then sets `transform: none`, and a
// sticky box with no transform sticks normally.

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
