"use client";

import { useEffect } from "react";
import { flushTrafficNow, onTrafficReady, trackTraffic, trafficReadyAt } from "@/lib/traffic-client";
import { TRAFFIC_EVENTS } from "@/lib/traffic-contract";
import type { LandingVariantKey } from "./landing-variants";

/* THE FIRST SCREEN AS THE VISITOR'S PHONE DREW IT (the analyst, 2026-10-04).
   Lab loads on Google's mobile profile showed the headline arriving 7–8 s
   after the tap (hero-entrance keeps the copy invisible until the page's
   JavaScript is in); this measures the same moments on real visits, so the
   analyst can say what the first screen costs and see a fix land. One
   `landing_timing` per load: the first paint and the LCP from the browser's
   own timeline, the headline's moment from hero-entrance
   (window.__jfHeroShownAt), "ready" = this effect (the JavaScript has taken
   over), the tracking library's own start, the KB downloaded so far and the
   connection where Chrome names it. Sent once the headline has shown and
   the tracking is in — or, leaving before that, by beacon with `shown` false
   and the moment they left. Nothing here is personal: numbers and a trade. */
export function LandingTiming({ industry }: { industry: LandingVariantKey | undefined }) {
  useEffect(() => {
    if (typeof performance === "undefined") return;
    const readyMs = Math.round(performance.now());
    const w = window as Window & { __jfHeroShownAt?: number };
    const num = (x: number | null | undefined) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x) : -1);
    const paint = () => {
      try { const p = performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint"); return p ? num(p.startTime) : -1; } catch { return -1; }
    };
    let lcp = -1;
    let lcpObserver: PerformanceObserver | null = null;
    try {
      lcpObserver = new PerformanceObserver((l) => { for (const e of l.getEntries()) lcp = num(e.startTime); });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch { lcpObserver = null; }
    const kb = () => {
      try {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
        const bytes = (nav?.transferSize ?? 0) + res.reduce((a, e) => a + (e.transferSize || 0), 0);
        return bytes > 0 ? Math.round(bytes / 1024) : -1;
      } catch { return -1; }
    };
    const connection = () => {
      const c = (navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } }).connection;
      return c ? { connection: String(c.effectiveType ?? ""), downlink: num(c.downlink), rtt: num(c.rtt) } : { connection: "", downlink: -1, rtt: -1 };
    };
    let sent = false;
    const send = (shown: boolean) => {
      if (sent) return;
      sent = true;
      lcpObserver?.disconnect();
      trackTraffic(TRAFFIC_EVENTS.landingTiming, {
        shown,
        hero_ms: shown ? num(w.__jfHeroShownAt) : -1,
        left_ms: shown ? -1 : Math.round(performance.now()),
        paint_ms: paint(), lcp_ms: lcp, ready_ms: readyMs, tracked_ms: num(trafficReadyAt()), kb: kb(),
        ...connection(),
        industry: industry ?? "default", variant: "e",
      });
    };
    // Shown: a beat for the LCP and the tracking to settle, then the send
    // (queued until the library is in, if it is not yet).
    let poll = 0, settle = 0, offReady: (() => void) | null = null;
    const whenShown = () => {
      window.clearInterval(poll);
      settle = window.setTimeout(() => { offReady = onTrafficReady(() => send(true)); }, 1500);
    };
    if (w.__jfHeroShownAt !== undefined) whenShown();
    else poll = window.setInterval(() => { if (w.__jfHeroShownAt !== undefined) whenShown(); }, 100);
    // Leaving first: what is known goes by beacon. traffic-client's own
    // pagehide flush ran before this handler, so the flush is asked for again.
    const onLeave = () => { send(w.__jfHeroShownAt !== undefined); flushTrafficNow(); };
    const onHide = () => { if (document.visibilityState === "hidden") onLeave(); };
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(poll); window.clearTimeout(settle); offReady?.(); lcpObserver?.disconnect();
      window.removeEventListener("pagehide", onLeave); document.removeEventListener("visibilitychange", onHide);
    };
  }, [industry]);
  return null;
}
