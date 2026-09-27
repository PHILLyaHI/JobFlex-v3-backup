"use client";

import { useEffect, useRef } from "react";
import { loadGsap, whenNear } from "./gsap-lazy";

/**
 * Mobile montage: side-by-side columns of cards (two since 2026-09-26), each
 * an infinite top-to-bottom loop (track content duplicated once, drifting
 * downward). Page-scroll velocity temporarily boosts every column, then
 * eases back.
 *
 * CRISP, NOT BLURRY (owner, 2026-09-26). The cards were drawn at `zoom: .5`
 * in three columns with a soft two-layer shadow, and the tracks slid by
 * fractional pixels on a composited layer — small grey type resampled every
 * frame. Now: two columns at TILE_ZOOM, a hairline instead of the shadow and
 * darker greys (.lp-mont-cols, proposals-pass.css), and every frame's offset
 * snapped to a whole device pixel.
 */

/* Pixels per second, not seconds per lap (owner, 2026-08-25). A fixed duration
   made a tall column travel further in the same time, so column three crawled
   while one and two raced — the durations were the same number but the tracks
   were not the same height. Speed is set here and the duration is derived from
   the measured track, so all three drift at one rate. */
const PX_PER_SEC = 17;
/* Just enough difference that the wall does not march in lockstep. */
const COLUMN_VARIANCE = [1, 0.9, 1.06];
/* Each card is a miniature of its full-width design: at 0.7 a phone column
   (~170 px) lays the card out at ~245 px, the desktop masonry's own width. */
const TILE_ZOOM = 0.7;
/* The gap between cards and after each copy — on the unzoomed wrapper, so
   the seam between the two copies is exactly the same as every other gap. */
const GAP = 8;

const EDGE_MASK =
  "linear-gradient(to bottom,transparent 0,rgba(0,0,0,.35) 18px,rgba(0,0,0,.75) 38px,#000 64px,#000 calc(100% - 64px),rgba(0,0,0,.75) calc(100% - 38px),rgba(0,0,0,.35) calc(100% - 18px),transparent 100%)";

export function MontageColumns({ columns }: { columns: React.ReactNode[][] }) {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tracks = Array.from(section.querySelectorAll<HTMLElement>(".carousel-track"));
    // The columns are built when the section comes near, with gsap from the
    // first move (gsap-lazy.ts) — not all at once on the first scroll.
    let alive = true;
    let loops: { kill(): void }[] = [];
    let st: { kill(): void } | null = null;
    let ro: ResizeObserver | null = null;
    void whenNear(section).then(loadGsap).then(({ gsap, ScrollTrigger }) => {
      if (!alive) return;
      // Whole device pixels only: a layer parked between pixels is resampled
      // and its type goes soft.
      const dpr = window.devicePixelRatio || 1;
      const snap = (v: string | number) => `${Math.round(parseFloat(String(v)) * dpr) / dpr}px`;
      const build = () =>
        tracks.map((track, i) => {
          // -distance → 0 travels exactly one copy of the content.
          const distance = track.offsetHeight / 2 || 600;
          const duration = (distance / PX_PER_SEC) * (COLUMN_VARIANCE[i] ?? 1);
          gsap.set(track, { y: -distance });
          return gsap.to(track, { y: 0, ease: "none", duration, repeat: -1, modifiers: { y: snap } });
        });
      loops = build();

      st = ScrollTrigger.create({
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

      // Images land after first paint and change the track height, which would
      // otherwise leave the columns on the durations measured before they did.
      ro = new ResizeObserver(() => {
        loops.forEach((l) => l.kill());
        loops = build();
      });
      tracks.forEach((t) => ro!.observe(t));
    });

    return () => {
      alive = false;
      ro?.disconnect();
      st?.kill();
      loops.forEach((l) => l.kill());
    };
  }, []);

  return (
    <div ref={sectionRef} className="carousel-section lp-mont-cols relative h-[560px] overflow-hidden px-5">
      {/* Edge fades as a mask, not a white overlay (owner, 2026-09-26): the
          overlays were 128 px with a solid-white outer band, which with the
          section's padding left ~70 px of empty white above and below the
          cards. The mask ramps over 64 px straight to the section's edge,
          with no solid band, so the cards run right up to it. */}
      <div
        className="mx-auto flex h-full max-w-[26rem] justify-center gap-2.5"
        style={{ WebkitMaskImage: EDGE_MASK, maskImage: EDGE_MASK }}
      >
        {columns.map((col, i) => (
          <div key={i} className="min-w-0 flex-1 overflow-hidden">
            <div className="carousel-track will-change-transform">
              {[0, 1].map((copy) => (
                <div
                  key={copy}
                  aria-hidden={copy === 1}
                  className="flex flex-col"
                  style={{ gap: GAP, paddingBottom: GAP }}
                >
                  {col.map((tile, j) => (
                    /* zoom renders each card as a miniature of its full-width
                       design instead of re-wrapping text at column width */
                    <div key={j} className="lp-tile w-full" style={{ zoom: TILE_ZOOM }}>
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
