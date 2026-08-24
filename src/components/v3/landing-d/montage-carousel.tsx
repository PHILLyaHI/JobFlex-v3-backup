"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Mobile montage: 3 side-by-side columns of cards, each an infinite
 * top-to-bottom loop (track content duplicated once, drifting downward).
 * Page-scroll velocity temporarily boosts every column, then eases back
 * (GSAP + ScrollTrigger pattern from AGENTS.md).
 */
export function MontageColumns({ columns }: { columns: React.ReactNode[][] }) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    gsap.registerPlugin(ScrollTrigger);

    const tracks = Array.from(section.querySelectorAll<HTMLElement>(".carousel-track"));
    // Slightly different base speeds per column so the wall feels organic.
    // Start at -50% and run to 0 so the cards flow top → bottom.
    const loops = tracks.map((track, i) => {
      gsap.set(track, { yPercent: -50 });
      return gsap.to(track, {
        yPercent: 0,
        ease: "none",
        duration: 36 + i * 7,
        repeat: -1,
      });
    });

    const st = ScrollTrigger.create({
      trigger: section,
      start: "top bottom",
      end: "bottom top",
      onUpdate(self) {
        const boost = Math.min(Math.abs(self.getVelocity()) / 300, 3);
        loops.forEach((loop) => {
          gsap
            .timeline({ overwrite: true })
            .to(loop, { timeScale: 1 + boost, duration: 0.2 })
            .to(loop, { timeScale: 1, duration: 1, ease: "power2.out" });
        });
      },
    });

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      loops.forEach((l) => l.pause());
    }

    return () => {
      st.kill();
      loops.forEach((l) => l.kill());
    };
  }, []);

  return (
    <div ref={sectionRef} className="carousel-section relative h-[560px] overflow-hidden px-5">
      {/* edge fade masks */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-gradient-to-b from-white to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t from-white to-transparent" />
      <div className="mx-auto flex h-full max-w-[26rem] justify-center gap-2">
        {columns.map((col, i) => (
          <div key={i} className="min-w-0 flex-1 overflow-hidden">
            <div className="carousel-track will-change-transform">
              {[0, 1].map((copy) => (
                <div key={copy} aria-hidden={copy === 1} className="space-y-2 pb-2">
                  {/* cards doubled so each loop half is taller than the viewport
                      (no blank band as the seam passes through) */}
                  {[...col, ...col].map((tile, j) => (
                    /* zoom renders each card as a miniature of its full-width
                       design instead of re-wrapping text at ~106px */
                    <div key={j} className="lp-tile w-full" style={{ zoom: 0.45 }}>
                      {tile}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
