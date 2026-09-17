"use client";

import { useEffect, useRef } from "react";
import { loadGsapFor, reducedMotion } from "./gsap-lazy";

/* A NUMBER THAT COUNTS UP (landing-e pass C, 2026-09-11). Server-rendered at
   its final value, so without JavaScript or under reduced motion it simply
   stands there. When it enters the viewport — once — it runs from 0 to the
   value in 1.2 s on power2.out, keeping the prefix ("$"), the suffix ("+")
   and the thousands separators. The final text stays in the flow as an
   invisible sizer and the moving digits sit on top of it in tabular figures,
   so the layout never shifts by a pixel while it counts. Inside the hero it
   fetches gsap without the first-move gate. The played flag is a ref: a
   parent that re-renders on its own timers (the proposal document does)
   must not restart or cancel the count. */

const NUM = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/;

export function Counter({ value, className = "", duration = 1.2 }: { value: string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const numeric = NUM.test(value);

  useEffect(() => {
    const el = ref.current;
    const m = value.match(NUM);
    if (!el || !m || reducedMotion() || played.current) return;
    const [, prefix, digits, suffix] = m;
    const decimals = (digits.split(".")[1] || "").length;
    const target = parseFloat(digits.replace(/,/g, ""));
    if (!Number.isFinite(target)) return;
    const fmt = (n: number) => prefix + n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;

    let alive = true;
    let tween: { kill(): void } | null = null;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || played.current) return;
      played.current = true;
      io.disconnect();
      void loadGsapFor(!!el.closest(".lp-hero")).then(({ gsap }) => {
        if (!alive) return;
        const state = { v: 0 };
        el.textContent = fmt(0);
        tween = gsap.to(state, { v: target, duration, ease: "power2.out", onUpdate: () => { el.textContent = fmt(state.v); }, onComplete: () => { el.textContent = value; } });
      });
    }, { threshold: 0.6 });
    io.observe(el);
    return () => { alive = false; io.disconnect(); if (tween) { tween.kill(); el.textContent = value; } };
  }, [value, duration]);

  if (!numeric) return <span className={className}>{value}</span>;
  return (
    <span className={`relative inline-block whitespace-nowrap tabular-nums ${className}`}>
      <span className="invisible" aria-hidden>{value}</span>
      <span ref={ref} className="absolute inset-0">{value}</span>
    </span>
  );
}
