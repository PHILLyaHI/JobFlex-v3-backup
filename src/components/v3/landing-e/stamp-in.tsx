"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { loadCustomEase, loadGsapFor, reducedMotion } from "./gsap-lazy";

/* A STAMP LANDING (landing-e pass C, 2026-09-11): scale 1.15 → 1 with a
   slight overshoot on a CustomEase, opacity 0 → 1, 300 ms. `active` runs it
   when it flips to true (the change order's APPROVED, at the moment its
   sequence gets there); without `active` it runs once when the element
   enters the viewport (the title sheet's SHEET 03 stamp). Under reduced
   motion nothing runs and the stamp is simply there.

   An `active` stamp mounts hidden so it cannot show its final state before
   the tween has taken it; the ease is fetched at the first move, ahead of
   time, so the landing is not waiting on an import. A 1.5 s safety shows
   the stamp if gsap never arrives. */

const EASE_ID = "lpStamp";
const EASE_PATH = "M0,0 C0.2,0 0.32,1.18 0.5,1.06 0.66,0.98 0.82,1 1,1";

export function StampIn({ active, children, className = "" }: { active?: boolean; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const played = useRef(false);
  const byViewport = active === undefined;
  // Hidden from its first frame for the `active` kind while motion is wanted;
  // a constant, so React never rewrites the inline opacity gsap then owns.
  const [startHidden] = useState(() => !byViewport && !!active && !reducedMotion());

  // Warm the ease up after the first move, before any stamp is due.
  useEffect(() => {
    if (reducedMotion()) return;
    void loadGsapFor(false).then(() => loadCustomEase()).catch(() => {});
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    if (!byViewport && !active) return;
    let alive = true;
    let io: IntersectionObserver | null = null;
    const safety = window.setTimeout(() => { if (alive) { el.style.opacity = "1"; el.style.transform = ""; } }, 1500);
    const run = () => {
      if (played.current) return;
      void Promise.all([loadGsapFor(!!el.closest(".lp-hero")), loadCustomEase()]).then(([{ gsap }, CustomEase]) => {
        if (!alive || played.current) return;
        played.current = true;
        window.clearTimeout(safety);
        if (!CustomEase.get(EASE_ID)) CustomEase.create(EASE_ID, EASE_PATH);
        gsap.fromTo(el, { scale: 1.15, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: EASE_ID, overwrite: "auto" });
      });
    };
    if (byViewport) {
      io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { io?.disconnect(); run(); } }, { threshold: 0.5 });
      io.observe(el);
    } else run();
    return () => { alive = false; io?.disconnect(); window.clearTimeout(safety); };
  }, [active, byViewport]);

  return (
    <span ref={ref} className={`inline-block ${className}`} style={startHidden ? { opacity: 0 } : undefined}>
      {children}
    </span>
  );
}
