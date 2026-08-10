"use client";

// MANUAL PROPOSAL / BLUEPRINT — mount contract.
// Route: /dashboard/manual-blueprint.
//
// The fleet's entrance cascade, which the Motion System makes mandatory on
// every page: blocks fade up 14px on a stagger. `.rv` / `.rv-in` are the
// fleet's literal classes, published by the ALWAYS-ON dashboard module as
// `.bp :global(.rv)` on the shell root — so the cascade works even though this
// route is deliberately absent from blueprint-shell's PAGE_STYLES (see the
// scoping note at the top of manual-blueprint.module.css).
//
// A LOCAL copy rather than an import from a sibling variant's folder: every lab
// variant is self-contained inside its own directory, and the cascade is a
// dozen lines. The genuinely SHARED piece — `useBlueprintContent`, the
// layout-effect timing that stops the paint-then-snap navigation glitch — is
// shell infrastructure and is imported from the shell exactly as every page
// does.
//
// WHY `[data-rv]` AND NOT `content.children`
// The donor pages return their blocks as direct children of `.content`, so
// they can walk it. This page returns ONE element — the 720px column wrapper
// that owns the measure and the local token layer. Walking `.content.children`
// there finds a single node and "cascades" it, which is no cascade at all.
// Collecting an explicit marker keeps the wrapper AND lets the masthead, the
// ten cards and the sticky bar be the twelve beats, in document order.
//
// STAGGER: 46ms, not the dashboard's 60/70. Twelve blocks at 70ms would still
// be arriving 840ms after the first, which is past the point where a cascade
// reads as one movement rather than as lag. Total here is ~550ms, inside the
// Motion System's reveal band.
//
// The sticky bar is one of the marked blocks: `.rv` parks it at
// `translateY(14px)` for its slot and then sets `transform: none`, and a sticky
// box with no transform sticks normally.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

const STAGGER_MS = 46;
const LEAD_IN_MS = 50;

export function useReveal() {
  // Referentially stable for the life of the mount: useBlueprintContent re-runs
  // — and would replay the whole cascade — on every identity change of `init`.
  const init = useCallback((content: HTMLElement) => {
    const blocks = Array.from(content.querySelectorAll<HTMLElement>("[data-rv]"));

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      blocks.forEach((b) => b.classList.add("rv", "rv-in"));
      return () => blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
    }

    blocks.forEach((b) => b.classList.add("rv"));
    const timers = blocks.map((b, i) =>
      window.setTimeout(() => b.classList.add("rv-in"), LEAD_IN_MS + i * STAGGER_MS),
    );

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      blocks.forEach((b) => b.classList.remove("rv", "rv-in"));
    };
  }, []);

  useBlueprintContent(init);
}
