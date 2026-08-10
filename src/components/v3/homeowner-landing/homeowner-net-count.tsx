"use client";

// HOMEOWNER LANDING — donor `safe('count', …)`, the 2,300+ network figure on
// the COVERAGE card.
//
// Its own component so the 60fps count-up re-renders one `<tspan>` and not the
// page. Ships as the donor's literal `0` from the server and only calls
// `toLocaleString` once the band has been seen — which cannot happen before
// mount — so there is no locale for hydration to disagree about.
//
// Reduced motion snaps straight to the final figure: the number is
// information, not decoration, so it is never withheld. The donor's easing
// (`1 - (1 - p)³` over 1600ms) and its one-shot IntersectionObserver at
// threshold 0.35 are unchanged.

import { useEffect, useState } from "react";
import { useInViewOnce, useReducedMotion } from "./use-homeowner-behavior";

const TARGET = 2300;
const DUR = 1600;

export function NetCount() {
  const seen = useInViewOnce("net", 0.35);
  const reduced = useReducedMotion();
  const [p, setP] = useState(0);

  useEffect(() => {
    if (!seen || reduced) return;
    let frame = 0;
    let t0: number | null = null;
    const step = (ts: number) => {
      if (t0 === null) t0 = ts;
      const progress = Math.min(1, (ts - t0) / DUR);
      setP(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [seen, reduced]);

  const value = !seen ? 0 : reduced ? TARGET : Math.round(TARGET * (1 - Math.pow(1 - p, 3)));

  return <tspan id="netCount">{seen ? value.toLocaleString("en-US") : "0"}</tspan>;
}
