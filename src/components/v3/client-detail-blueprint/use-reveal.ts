"use client";

// CLIENT DETAIL / BLUEPRINT — mount contract.
// Route: /dashboard/client-detail.
//
// The fleet's entrance cascade, which the Motion System makes mandatory on
// every page: blocks fade up 14px on a stagger, then the KPI cells run left to
// right behind their own block. `.rv` / `.rv-in` / `.rv-cell` are the fleet's
// literal classes, published by the ALWAYS-ON dashboard module as
// `.bp :global(.rv)` on the shell root — so the cascade works even though this
// route is deliberately absent from blueprint-shell's PAGE_STYLES (see the
// scoping note at the top of client-detail.module.css).
//
// A LOCAL copy rather than an import from a sibling page's folder: every page
// owns its cascade, and the cascade is a dozen lines. The genuinely SHARED
// piece — `useBlueprintContent`, the layout-effect timing that stops the
// paint-then-snap navigation glitch — is shell infrastructure and is imported
// from the shell exactly as every page does.
//
// WHY `[data-rv]` AND NOT `content.children`
// The donor pages return their blocks as direct children of `.content`, so they
// can walk it. This page returns ONE element — the wrapper that owns the local
// token layer. Walking `.content.children` there finds a single node and
// "cascades" it, which is no cascade at all. An explicit marker keeps the
// wrapper AND lets the masthead, the four bands and the two tail cards be the
// beats, in document order.
//
// THIS PLAYS EXACTLY ONCE, ON MOUNT. It is deliberately NOT wired to a
// MutationObserver on any list container. That pattern — the most expensive
// trap in this codebase — replays the whole entrance on every render, so
// filtering the proposal chips would drop the ledger to opacity 0 and crawl it
// back, and a user would report it as "my click did nothing". The chips
// repaint silently; the caller decides when a list is genuinely ARRIVING, and
// here that is first paint and nothing else.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

const STAGGER_MS = 60;
const LEAD_IN_MS = 50;
/** The Motion System's own offset for a cell run behind its block. */
const CELL_DELAY_MS = 160;
const CELL_STAGGER_MS = 45;

export function useReveal() {
  // Referentially stable for the life of the mount: useBlueprintContent re-runs
  // — and would replay the whole cascade — on every identity change of `init`.
  const init = useCallback((content: HTMLElement) => {
    const blocks = Array.from(content.querySelectorAll<HTMLElement>("[data-rv]"));
    const cells = Array.from(content.querySelectorAll<HTMLElement>("[data-rv-cell]"));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      blocks.forEach((b) => b.classList.add("rv", "rv-in"));
      cells.forEach((c) => c.classList.add("rv-cell", "rv-in"));
      return () => {
        blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
        cells.forEach((c) => c.classList.remove("rv-cell", "rv-in"));
      };
    }

    blocks.forEach((b) => b.classList.add("rv"));
    cells.forEach((c) => c.classList.add("rv-cell"));

    const timers = blocks.map((b, i) =>
      window.setTimeout(() => b.classList.add("rv-in"), LEAD_IN_MS + i * STAGGER_MS),
    );

    // The cells belong to the figure strip, whose own slot is index 2. Their
    // run starts after that block has begun, not after the whole cascade.
    const cellBase = LEAD_IN_MS + 2 * STAGGER_MS + CELL_DELAY_MS;
    cells.forEach((c, i) => {
      timers.push(
        window.setTimeout(() => c.classList.add("rv-in"), cellBase + i * CELL_STAGGER_MS),
      );
    });

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
      cells.forEach((c) => c.classList.remove("rv-cell", "rv-in"));
    };
  }, []);

  useBlueprintContent(init);
}
