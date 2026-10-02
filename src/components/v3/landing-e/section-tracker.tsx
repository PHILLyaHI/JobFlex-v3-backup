"use client";

import { useEffect } from "react";
import { trackTraffic } from "@/lib/traffic-client";
import { TRAFFIC_EVENTS } from "@/lib/traffic-contract";
import { LANDING_SECTIONS } from "@/lib/landing-sections";
import type { LandingVariantKey } from "./landing-variants";

/* One `landing_section` per section the visitor actually reaches (the
   analyst, 2026-10-02): which parts of the page they saw before they left,
   and how many seconds in. The sections are the page's own blocks
   (lib/landing-sections), found by id or by their content-visibility
   wrapper, so the server-rendered markup stays as it is. A section counts
   once per load, when a quarter of it is on screen — or, for a block taller
   than the window, when a third of the window is showing it. One observer
   for all of them; sent by beacon, so the last one survives the page leaving. */
export function SectionTracker({ industry }: { industry: LandingVariantKey | undefined }) {
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const start = performance.now();
    const seen = new Set<string>();
    const targets = new Map<Element, { key: string; index: number }>();
    LANDING_SECTIONS.forEach((section, index) => {
      const el = section.selector.map((sel) => document.querySelector(sel)).find((x): x is Element => !!x);
      if (el) targets.set(el, { key: section.key, index });
    });
    if (!targets.size) return;
    const observer = new IntersectionObserver((entries) => {
      const vh = window.innerHeight || 1;
      for (const entry of entries) {
        const t = targets.get(entry.target);
        if (!t || !entry.isIntersecting || seen.has(t.key)) continue;
        const tall = entry.boundingClientRect.height > vh * 0.75;
        const reached = entry.intersectionRatio >= 0.25 || (tall && entry.intersectionRect.height >= vh * 0.3);
        if (!reached) continue;
        seen.add(t.key);
        observer.unobserve(entry.target);
        trackTraffic(TRAFFIC_EVENTS.landingSection, {
          section: t.key,
          index: t.index,
          after: Math.round((performance.now() - start) / 1000),
          industry: industry ?? "default",
          variant: "e",
        });
      }
    }, { threshold: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.5] });
    for (const el of targets.keys()) observer.observe(el);
    return () => observer.disconnect();
  }, [industry]);
  return null;
}
