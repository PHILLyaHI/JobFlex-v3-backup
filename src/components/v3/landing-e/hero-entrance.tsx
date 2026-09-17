"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { loadGsapNow, loadSplitText, reducedMotion } from "./gsap-lazy";

/* THE HERO'S ENTRANCE (landing-e pass C, 2026-09-11). The H1's two lines rise
   out of a mask one after the other (SplitText lines + mask), the line under
   it follows 150 ms later, the buttons 250 ms later. Once, at load, never
   again. No flash: the three blocks are server-rendered with `visibility:
   hidden` (the .lp-enter class), the masks are built while they are still
   hidden, the lines are pushed below their masks, and only then is
   visibility lifted — so the first painted frame is the first frame of the
   motion. The stylesheet lifts the class under prefers-reduced-motion and
   under <noscript>, and a 3 s safety here lifts it if gsap never arrives.
   gsap is fetched without the first-move gate but after `load` — after the
   LCP plate has painted — so the entrance never sits in front of the LCP. */

const SAFETY_MS = 3000;

export function HeroEntrance({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>(".lp-enter"));
    const show = () => blocks.forEach((b) => { b.style.visibility = "visible"; });
    if (reducedMotion()) { show(); return; }

    let alive = true;
    let revert: (() => void) | null = null;
    const safety = window.setTimeout(show, SAFETY_MS);

    void Promise.all([loadGsapNow(), loadSplitText()]).then(([{ gsap }, SplitText]) => {
      if (!alive) return;
      window.clearTimeout(safety);
      const h1 = root.querySelector<HTMLElement>("[data-entrance='h1']");
      const sub = root.querySelector<HTMLElement>("[data-entrance='sub']");
      const cta = root.querySelector<HTMLElement>("[data-entrance='cta']");
      if (!h1) { show(); return; }

      // The masks are made while the H1 is still hidden; autoSplit re-runs
      // onSplit if the font lands late, and the returned tween is what it
      // reverts — the documented pattern for text that must not re-flow.
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
          h1.style.visibility = "visible";
          const tl = gsap.timeline();
          tl.to(self.lines, { yPercent: 0, duration: 0.9, ease: "power3.out", stagger: 0.12 }, 0);
          if (sub) tl.fromTo(sub, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.15);
          if (cta) tl.fromTo(cta, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power2.out" }, 0.25);
          return tl;
        },
      });
      revert = () => split.revert();
    }).catch(show);

    return () => {
      alive = false;
      window.clearTimeout(safety);
      revert?.();
    };
  }, []);

  return (
    <div ref={ref} className="contents">
      {children}
    </div>
  );
}
