"use client";

import { useEffect } from "react";
import { trackTraffic } from "@/lib/traffic-client";
import { TRAFFIC_EVENTS } from "@/lib/traffic-contract";
import type { LandingVariantKey } from "./landing-variants";

/* One `cta_click` per click on any element carrying `data-cta` — the hero
   button, the Google button, the gold pill, the sticky phone bar, the footer,
   the nav and the intro (CRO stage 1, 2026-09-09). Delegated from the
   document so the anchors stay plain server-rendered links; the capture phase
   runs before the navigation, and trackTraffic sends by beacon, so the event
   survives the page leaving. Properties: placement, the button's words,
   the trade hero shown ("default" when none), the target path. */
export function CtaTracker({ industry }: { industry: LandingVariantKey | undefined }) {
  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      const target = ev.target instanceof Element ? ev.target.closest<HTMLElement>("[data-cta]") : null;
      if (!target) return;
      const placement = target.dataset.cta || "unknown";
      const label = (target.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const href = target instanceof HTMLAnchorElement ? target.getAttribute("href") ?? "" : "";
      trackTraffic(TRAFFIC_EVENTS.ctaClick, {
        placement,
        label,
        industry: industry ?? "default",
        href: href.split("?")[0],
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [industry]);
  return null;
}
