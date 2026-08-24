"use client";

import { useEffect } from "react";

/**
 * The entire motion budget for Landing C: one 12px settle per block, fired
 * once, on approach.
 *
 * cal.com reads calm largely because almost nothing on it moves — no marquee,
 * no auto-advancing carousel, no parallax. This page copies that discipline
 * rather than the house motion system's fuller vocabulary, so the observer
 * does exactly one job and then disconnects.
 *
 * `rootMargin` fires the reveal ~80px before the block enters the frame, so
 * the settle is finishing as the reader arrives rather than starting under
 * their eye. Elements are unobserved on entry: nothing re-animates on the way
 * back up, which is the difference between a page that feels settled and one
 * that feels busy.
 *
 * prefers-reduced-motion is honoured twice over — the CSS neutralises the
 * transform, and this hook returns before observing so no class is ever
 * toggled. Either alone would do; both means a change to one cannot silently
 * strand the other.
 */
export function useLandingCReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".jf-landing-c [data-rv]"));
    if (nodes.length === 0) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced || typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add("lc-in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("lc-in");
          io.unobserve(entry.target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -80px 0px" },
    );

    nodes.forEach((n) => io.observe(n));

    /* Safety sweep. Content that is only visible once JS has classed it is a
     * revenue bug if the class never lands, and IntersectionObserver delivery
     * is coalesced per frame — a hard flick that jumps several screens between
     * frames can in principle skip an element, which then stays at opacity 0
     * for good. This passive listener re-checks anything still hidden that has
     * already passed the fold, and removes itself once every block is in, so
     * it costs nothing for the rest of the visit. */
    let sweeping = false;
    const sweep = () => {
      sweeping = false;
      const left = nodes.filter((n) => !n.classList.contains("lc-in"));
      if (left.length === 0) {
        window.removeEventListener("scroll", onScroll);
        return;
      }
      for (const n of left) {
        if (n.getBoundingClientRect().top < window.innerHeight) {
          n.classList.add("lc-in");
          io.unobserve(n);
        }
      }
    };
    const onScroll = () => {
      if (sweeping) return;
      sweeping = true;
      requestAnimationFrame(sweep);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
}
