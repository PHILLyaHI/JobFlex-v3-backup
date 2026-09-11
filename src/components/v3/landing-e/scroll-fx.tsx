"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

/**
 * Global scroll polish (all breakpoints):
 * - body paragraphs rise from low opacity to full as they enter the viewport
 * - elements tagged [data-parallax="px"] drift gently against scroll
 * Gated on prefers-reduced-motion. Renders nothing.
 */
export function ScrollFx() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.registerPlugin(ScrollTrigger);

    const created: ScrollTrigger[] = [];

    // Paragraph reveal — only visible paragraphs (skip display:none breakpoint variants)
    const ps = gsap.utils
      .toArray<HTMLElement>("main p")
      .filter((el) => el.offsetParent !== null);
    gsap.set(ps, { opacity: 0.12, y: 14 });
    created.push(
      ...ScrollTrigger.batch(ps, {
        start: "top 88%",
        once: true,
        onEnter: (els) =>
          gsap.to(els, {
            opacity: 1,
            y: 0,
            duration: 0.7,
            ease: "power2.out",
            stagger: 0.12,
          }),
      })
    );

    // Gentle parallax on tagged visuals
    gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
      const speed = parseFloat(el.dataset.parallax || "24");
      const tween = gsap.fromTo(
        el,
        { y: speed },
        {
          y: -speed,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: 0.6,
          },
        }
      );
      if (tween.scrollTrigger) created.push(tween.scrollTrigger);
    });

    return () => created.forEach((t) => t.kill());
  }, []);

  return null;
}
