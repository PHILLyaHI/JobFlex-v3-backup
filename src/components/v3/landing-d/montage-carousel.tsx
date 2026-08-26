"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Mobile montage: 3 side-by-side columns of cards, each an infinite
 * top-to-bottom loop (track content duplicated once, drifting downward).
 * Page-scroll velocity temporarily boosts every column, then eases back.
 */

/* Pixels per second, not seconds per lap (owner, 2026-08-25). A fixed duration
   made a tall column travel further in the same time, so column three crawled
   while one and two raced — the durations were the same number but the tracks
   were not the same height. Speed is set here and the duration is derived from
   the measured track, so all three drift at one rate. */
const PX_PER_SEC = 17;
/* Just enough difference that the wall does not march in lockstep. */
const COLUMN_VARIANCE = [1, 0.93, 1.06];

export function MontageColumns({ columns }: { columns: React.ReactNode[][] }) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    gsap.registerPlugin(ScrollTrigger);

    const tracks = Array.from(section.querySelectorAll<HTMLElement>(".carousel-track"));
    const build = () =>
      tracks.map((track, i) => {
        // yPercent -50 → 0 travels exactly one copy of the content.
        const distance = track.offsetHeight / 2 || 600;
        const duration = (distance / PX_PER_SEC) * (COLUMN_VARIANCE[i] ?? 1);
        gsap.set(track, { yPercent: -50 });
        return gsap.to(track, { yPercent: 0, ease: "none", duration, repeat: -1 });
      });

    let loops = build();

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

    // Images land after first paint and change the track height, which would
    // otherwise leave the columns on the durations measured before they did.
    const ro = new ResizeObserver(() => {
      loops.forEach((l) => l.kill());
      loops = build();
    });
    tracks.forEach((t) => ro.observe(t));

    return () => {
      ro.disconnect();
      st.kill();
      loops.forEach((l) => l.kill());
    };
  }, []);

  return (
    <div ref={sectionRef} className="carousel-section relative h-[560px] overflow-hidden px-5">
      {/* Edge fades. Multi-stop and taller than the old 56px band: a two-stop
          `white → transparent` ramp goes through a grey midpoint in sRGB and
          showed as a seam exactly where it was meant to disappear. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32"
        style={{
          background:
            "linear-gradient(to bottom,#fff 0%,rgba(255,255,255,.99) 28%,rgba(255,255,255,.86) 52%,rgba(255,255,255,.5) 76%,rgba(255,255,255,0) 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-32"
        style={{
          background:
            "linear-gradient(to top,#fff 0%,rgba(255,255,255,.99) 28%,rgba(255,255,255,.86) 52%,rgba(255,255,255,.5) 76%,rgba(255,255,255,0) 100%)",
        }}
      />
      <div className="mx-auto flex h-full max-w-[26rem] justify-center gap-2">
        {columns.map((col, i) => (
          <div key={i} className="min-w-0 flex-1 overflow-hidden">
            <div className="carousel-track will-change-transform">
              {[0, 1].map((copy) => (
                /* pb-1, not pb-2: the cards carry `zoom: .5`, which halves
                   their 8px space-y to 4px on screen, but the wrapper's own
                   padding is not zoomed — so an 8px pad opened a gap twice the
                   size of every other one, once per lap (owner, 2026-08-25). */
                <div key={copy} aria-hidden={copy === 1} className="space-y-2 pb-1">
                  {col.map((tile, j) => (
                    /* zoom renders each card as a miniature of its full-width
                       design instead of re-wrapping text at ~105px */
                    <div key={j} className="lp-tile w-full" style={{ zoom: 0.5 }}>
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
