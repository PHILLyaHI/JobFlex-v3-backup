"use client";

import { useEffect } from "react";
import { loadGsap, whenNear } from "./gsap-lazy";

/**
 * Global scroll polish (all breakpoints):
 * - body paragraphs rise from low opacity to full as they enter the viewport
 * - elements tagged [data-parallax="px"] drift gently against scroll
 * Gated on prefers-reduced-motion. Renders nothing.
 *
 * landing-e pass C (2026-09-11): gsap arrives on the visitor's first move
 * (gsap-lazy.ts), so the paragraphs it dims are only those still below the
 * viewport at that moment — nothing already on screen flickers — and the
 * hero is left alone (it has its own entrance).
 */
export function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let alive = true;
    const created: { kill(): void }[] = [];

    // SECTION BY SECTION (pass C, 2026-09-11). Setting up every paragraph and
    // parallax at once forced the browser to lay out the whole page —
    // including the content-visibility sections it had skipped — in one
    // 300 ms task on the first scroll under a slow CPU. Each section now
    // gets its reveals and parallax when it comes within a viewport of the
    // screen, so the work arrives in small pieces as the reader does.
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main .lp-cv, main .lp-intro"));
    const setup = (section: HTMLElement) =>
      loadGsap().then(({ gsap, ScrollTrigger }) => {
        if (!alive) return;
        const ps = Array.from(section.querySelectorAll<HTMLElement>("p")).filter(
          (el) => el.offsetParent !== null && !el.closest("#hero") && el.getBoundingClientRect().top > window.innerHeight,
        );
        if (ps.length) {
          gsap.set(ps, { opacity: 0.12, y: 14 });
          created.push(
            ...ScrollTrigger.batch(ps, {
              start: "top 88%",
              once: true,
              onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out", stagger: 0.12 }),
            }),
          );
        }
        section.querySelectorAll<HTMLElement>("[data-parallax]").forEach((el) => {
          const speed = parseFloat(el.dataset.parallax || "24");
          const tween = gsap.fromTo(el, { y: speed }, { y: -speed, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 0.6 } });
          if (tween.scrollTrigger) created.push(tween.scrollTrigger);
        });
      });
    for (const section of sections) void whenNear(section).then(() => { if (alive) void setup(section); });

    return () => {
      alive = false;
      created.forEach((t) => t.kill());
    };
  }, []);

  return null;
}
