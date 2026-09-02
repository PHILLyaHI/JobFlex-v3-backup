"use client";

import { useEffect, useRef } from "react";

/* Landing A — behaviour.
 *
 * Two effects, both cosmetic, both fail-safe:
 *
 *   data-rv-ready  stamped on the root once the observer is actually wired.
 *                  landing-a.css only hides `[data-rv]` INSIDE a root that
 *                  carries this attribute, so if JS never runs — or is still
 *                  parsing, or the user prefers reduced motion — the page
 *                  renders fully visible. The reveal can never eat content.
 *   data-scrolled  drives the nav pill's cast shadow. Read from a passive
 *                  listener and written only on change.
 *
 * `scroll-timeline` / `animation-timeline: view()` would remove the observer
 * entirely, but it is not yet safe to rely on across the browsers contractors
 * actually run, so this stays imperative.
 */
export function useLandingABehavior<T extends HTMLElement>() {
  const rootRef = useRef<T | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ── reveal on scroll ───────────────────────────────────────────────── */
    let io: IntersectionObserver | undefined;
    if (!reduced && typeof IntersectionObserver === "function") {
      // Stamp only once we know the observer exists; see the note above.
      root.setAttribute("data-rv-ready", "1");

      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            // Stagger siblings so a grid resolves left-to-right rather than
            // snapping in as one block.
            const step = Number(el.dataset.rv) || 0;
            el.style.transitionDelay = step > 0 ? `${Math.min(step, 6) * 70}ms` : "";
            el.classList.add("la-in");
            io?.unobserve(el);
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
      );

      for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-rv]"))) {
        io.observe(el);
      }
    }

    /* ── nav condense ──────────────────────────────────────────────────── */
    let scrolled = false;
    const onScroll = () => {
      const next = window.scrollY > 12;
      if (next === scrolled) return;
      scrolled = next;
      root.setAttribute("data-scrolled", next ? "1" : "0");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return rootRef;
}
