"use client";

/* GSAP on demand (landing-e pass C, 2026-09-11). Nothing below the hero needs
   the library before the visitor moves: the paragraph reveal, the parallax,
   the marquees, the montage, the counters and the callouts all wait for the
   first scroll, pointer, touch or key — or eight seconds — and then one
   dynamic import brings gsap and ScrollTrigger in. The hero is the one
   exception: its entrance and its mock's callouts call `loadGsapNow()`,
   which skips the gate but still runs after the page has painted. The
   plugins (SplitText, DrawSVG, CustomEase — all in the free gsap package
   since 3.13) are separate imports, fetched by the first caller that needs
   them. Every effect that awaits these checks its own `alive` flag before
   touching the DOM. */

import type { gsap as GsapType } from "gsap";
import type { ScrollTrigger as ScrollTriggerType } from "gsap/ScrollTrigger";
import type { SplitText as SplitTextType } from "gsap/SplitText";
import type { DrawSVGPlugin as DrawSVGType } from "gsap/DrawSVGPlugin";
import type { CustomEase as CustomEaseType } from "gsap/CustomEase";

export type GsapCore = { gsap: typeof GsapType };
export type GsapBundle = GsapCore & { ScrollTrigger: typeof ScrollTriggerType };

const EVENTS = ["scroll", "pointerdown", "touchstart", "keydown", "wheel"] as const;
const IDLE_MS = 8000;

let ready: Promise<void> | null = null;
let core: Promise<GsapCore> | null = null;
let bundle: Promise<GsapBundle> | null = null;

/** Resolves at the visitor's first move, or after IDLE_MS. */
function firstMove(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve) => {
    if (typeof window === "undefined") return;
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      for (const ev of EVENTS) window.removeEventListener(ev, go);
      resolve();
    };
    for (const ev of EVENTS) window.addEventListener(ev, go, { passive: true });
    window.setTimeout(go, IDLE_MS);
  });
  return ready;
}

/** The core alone — what the hero, the counters, the stamps and the callouts need. */
function fetchCore(): Promise<GsapCore> {
  if (!core) core = import("gsap").then((g) => ({ gsap: g.default }));
  return core;
}

/** Core + ScrollTrigger — for the scroll effects, the marquees and the montage. */
function fetchBundle(): Promise<GsapBundle> {
  if (!bundle) {
    bundle = Promise.all([fetchCore(), import("gsap/ScrollTrigger")]).then(([c, s]) => {
      c.gsap.registerPlugin(s.ScrollTrigger);
      return { gsap: c.gsap, ScrollTrigger: s.ScrollTrigger };
    });
  }
  return bundle;
}

/** After the page has loaded and the next idle slot, so nothing here competes with the LCP paint. */
async function afterLoadIdle(): Promise<void> {
  if (typeof window === "undefined") return;
  if (document.readyState !== "complete") await new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true }));
  await new Promise<void>((r) => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => r(), { timeout: 1200 });
    else window.setTimeout(r, 200);
  });
}

/** gsap + ScrollTrigger after the visitor's first move (below the fold). */
export async function loadGsap(): Promise<GsapBundle> {
  await firstMove();
  return fetchBundle();
}

/** The core without the gate (the hero), after load and an idle slot. */
export async function loadGsapNow(): Promise<GsapCore> {
  await afterLoadIdle();
  return fetchCore();
}

/** The core, gated or not: eager for anything inside the hero. */
export async function loadGsapFor(eager: boolean): Promise<GsapCore> {
  if (eager) return loadGsapNow();
  await firstMove();
  return fetchCore();
}

/** Resolves when `el` is within one viewport of the screen (or already on it). */
export function whenNear(el: Element, margin = "60%"): Promise<void> {
  return new Promise((resolve) => {
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io.disconnect(); resolve(); } }, { rootMargin: margin + " 0px" });
    io.observe(el);
  });
}

let split: Promise<typeof SplitTextType> | null = null;
export function loadSplitText(): Promise<typeof SplitTextType> {
  if (!split) split = Promise.all([fetchCore(), import("gsap/SplitText")]).then(([c, m]) => { c.gsap.registerPlugin(m.SplitText); return m.SplitText; });
  return split;
}

let draw: Promise<typeof DrawSVGType> | null = null;
export function loadDrawSVG(): Promise<typeof DrawSVGType> {
  if (!draw) draw = Promise.all([fetchCore(), import("gsap/DrawSVGPlugin")]).then(([c, m]) => { c.gsap.registerPlugin(m.DrawSVGPlugin); return m.DrawSVGPlugin; });
  return draw;
}

let ease: Promise<typeof CustomEaseType> | null = null;
export function loadCustomEase(): Promise<typeof CustomEaseType> {
  if (!ease) ease = Promise.all([fetchCore(), import("gsap/CustomEase")]).then(([c, m]) => { c.gsap.registerPlugin(m.CustomEase); return m.CustomEase; });
  return ease;
}

/** One check for every animated piece: the visitor asked for stillness. */
export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
