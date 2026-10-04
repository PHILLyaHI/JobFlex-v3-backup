"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { loadGsapAtOnce, loadSplitText } from "./gsap-lazy";

/* THE HERO'S ENTRANCE (landing-e pass C, 2026-09-11). The H1's two lines rise
   out of a mask one after the other (SplitText lines + mask), the line under
   it follows 150 ms later, the buttons 250 ms later. Once, at load, never
   again.

   ON A DESK THAT IS READY FOR IT, AND NOWHERE ELSE (2026-10-04). The three
   blocks used to be server-rendered invisible and shown from here — after
   the page's JavaScript, `load`, an idle slot and gsap, or a 3 s safety. On
   a phone on Google's mobile profile that was a black first screen for 7–8 s
   (three ad clicks in four left without a second page). The copy is now on
   screen from the first paint, and the page arms the entrance itself: the
   hero's inline prelude (hero.tsx) sets html[data-lp-entrance="pending"] on
   a desk with no reduced-motion preference, which is the one state the
   stylesheet hides `.lp-enter` under. If gsap is here while that still
   stands, the masks are built, the lines are pushed below them, the line
   and the buttons are set to zero, and the hold is lifted — the first frame
   the visitor sees of the copy is the first frame of the motion, as before.
   If the prelude's 1.8 s ran out first, the copy is already being read and
   nothing is replayed over it. A phone, a touch screen, reduced motion, no
   prelude (a client-side arrival): never armed, nothing to do — and gsap is
   not fetched for the hero at all. */

const ENTRANCE_ATTR = "data-lp-entrance";

/* The moment the headline became visible, ms from the tap — read by
   landing-timing.tsx for the analyst (2026-10-04). Never armed: it came with
   the first paint. Animated: the start of the rise, which the eye reads as
   the headline arriving. Out of budget: the prelude's timer marked it. */
function markShown(at?: number) {
  const w = window as Window & { __jfHeroShownAt?: number };
  if (w.__jfHeroShownAt === undefined) w.__jfHeroShownAt = Math.round(at ?? performance.now());
}
function firstPaint(): number | undefined {
  try { return performance.getEntriesByType("paint").find((e) => e.name === "first-contentful-paint")?.startTime; } catch { return undefined; }
}

export function HeroEntrance({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const html = document.documentElement;
    const pending = () => html.getAttribute(ENTRANCE_ATTR) === "pending";
    // Not armed, or out of budget: the copy is on screen already.
    if (!pending()) { markShown(firstPaint()); return; }

    let alive = true;
    let revert: (() => void) | null = null;
    const lift = () => { if (pending()) { html.removeAttribute(ENTRANCE_ATTR); markShown(); } };

    // At once, not after `load`: the wait is the visitor's now, and on a desk
    // the library is a few hundredths of a second.
    void Promise.all([loadGsapAtOnce(), loadSplitText()]).then(([{ gsap }, SplitText]) => {
      // The budget ended first: the copy is being read, nothing is replayed over it.
      if (!alive || !pending()) return;
      window.clearTimeout((window as Window & { __jfEntranceTimer?: number }).__jfEntranceTimer);
      const h1 = root.querySelector<HTMLElement>("[data-entrance='h1']");
      const sub = root.querySelector<HTMLElement>("[data-entrance='sub']");
      const cta = root.querySelector<HTMLElement>("[data-entrance='cta']");
      if (!h1) { lift(); return; }

      // The masks are made while the copy is still held back; autoSplit
      // re-runs onSplit if the font lands late, and the returned tween is
      // what it reverts — the documented pattern for text that must not
      // re-flow.
      const split = SplitText.create(h1, {
        type: "lines",
        mask: "lines",
        linesClass: "lp-h1-line",
        autoSplit: true,
        onSplit: (self) => {
          // 130%, not 110%: the mask now clips a fifth of an em lower than the
          // line box (landing-e.css, .lp-h1-line-mask), so a line parked at
          // 110% could show its top edge before it rose.
          gsap.set(self.lines, { yPercent: 130 });
          // At rest nothing may keep a transform or a will-change: either one
          // leaves the block on a layer of its own, and Chrome draws text on
          // such a layer with greyscale antialiasing instead of ClearType.
          const moved = [sub, cta].filter((el): el is HTMLElement => !!el);
          const tl = gsap.timeline({
            onComplete: () => {
              gsap.set(self.lines, { clearProps: "transform", willChange: "auto" });
              if (moved.length) gsap.set(moved, { clearProps: "transform" });
            },
          });
          tl.to(self.lines, { yPercent: 0, duration: 0.9, ease: "power3.out", stagger: 0.12 }, 0);
          if (sub) tl.fromTo(sub, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.15);
          if (cta) tl.fromTo(cta, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.25);
          // Every start state is set — the lines under their masks, the line
          // and the buttons at zero — so the hold is lifted and the motion is
          // what shows them.
          lift();
          return tl;
        },
      });
      revert = () => split.revert();
    }).catch(lift);

    return () => {
      alive = false;
      revert?.();
    };
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
