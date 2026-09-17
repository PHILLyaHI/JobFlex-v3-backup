"use client";

import { useEffect } from "react";

/* LAYOUT AHEAD OF THE SCROLL (landing-e pass C, 2026-09-11). The sections
   under the intro sit in content-visibility: auto boxes, so the first paint
   skips their layout — good for the LCP, but the first scroll then paid for
   it: laying a big section out on demand was a 130–220 ms task on a slow
   CPU. After `load`, in idle slots, this walks the boxes one at a time and
   asks each for a descendant's box, which lays that section out in its own
   short task while the reader is still on the hero. Nothing visible changes;
   under reduced motion it runs the same (it is layout, not motion). */

export function WarmLayout() {
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const idle = (cb: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 120));
    let alive = true;
    const boxes = Array.from(document.querySelectorAll<HTMLElement>("main .lp-cv"));
    const next = (i: number) => {
      if (!alive || i >= boxes.length) return;
      idle(() => {
        if (!alive) return;
        const inner = boxes[i].firstElementChild ?? boxes[i];
        void inner.getBoundingClientRect();
        next(i + 1);
      });
    };
    const start = () => next(0);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    return () => { alive = false; window.removeEventListener("load", start); };
  }, []);
  return null;
}
