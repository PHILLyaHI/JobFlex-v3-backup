"use client";

// MANAGE YOUR PROFILE / BLUEPRINT — the fleet's MOTION SYSTEM — BALANCED.
//
// The same block reveal + delegated press feedback every other blueprint page
// runs, at the same numbers (see video-estimator-motion.ts for the annotated
// original). Only what this page's markup actually has is bound: there is no
// KPI strip, no week strip and no ported list here, so those layers are absent
// rather than restated.
//
// The press binding is DELEGATED, not `pressify()`-bound at init: this page's
// controls come and go with state (the "Leads with" select, "Discard changes",
// the trade chips) and a one-shot binding would give the effect only to what
// existed on mount.
//
// The sidebar cascade, the graph-paper parallax and FLUID SCALE belong to the
// persistent chrome and already run from blueprint-shell/shell-behavior.ts.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

/**
 * @param btnClass this module's hashed `.btn` class — press feedback is
 *   delegated, so it needs a class to test against.
 */
export function useHireProfileMotion(btnClass: string) {
  // Referentially stable for the life of the mount: useBlueprintContent re-runs
  // — and replays the whole entrance — on every identity change of `init`.
  const init = useCallback(
    (content: HTMLElement) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

      const disposers: Array<() => void> = [];

      const vpH = window.innerHeight;
      const scrollHost = content.closest<HTMLElement>(".main");
      let velLastY = scrollHost ? scrollHost.scrollTop : 0;
      let velLastT = performance.now();
      let scrollVel = 0; // px/ms
      if (scrollHost) {
        const onScroll = () => {
          const now = performance.now();
          scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
          velLastY = scrollHost.scrollTop;
          velLastT = now;
        };
        scrollHost.addEventListener("scroll", onScroll, { passive: true });
        disposers.push(() => scrollHost.removeEventListener("scroll", onScroll));
      }

      const blocks = Array.from(content.children) as HTMLElement[];
      blocks.forEach((el, i) => {
        el.classList.add("rv");
        const initial = el.getBoundingClientRect().top < vpH;
        if (!initial) el.dataset.rvScroll = "1";
        el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
      });
      const io = new IntersectionObserver(
        (es) => {
          es.forEach((en) => {
            if (!en.isIntersecting) return;
            const target = en.target as HTMLElement;
            if (target.dataset.rvScroll) {
              const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
              target.style.transitionDuration = dur + "ms";
            }
            target.classList.add("rv-in");
            io.unobserve(target);
            target.addEventListener("transitionend", function te() {
              target.style.transitionDelay = "";
              target.style.transitionDuration = "";
              target.removeEventListener("transitionend", te);
            });
          });
        },
        { threshold: 0, rootMargin: "0px 0px 60px 0px" },
      );
      blocks.forEach((el) => io.observe(el));
      disposers.push(() => io.disconnect());

      const onDown = (e: Event) => {
        const el = (e.target as HTMLElement | null)?.closest<HTMLElement>("." + btnClass);
        if (!el) return;
        el.classList.remove("pressed");
        void el.offsetWidth;
        el.classList.add("pressed");
      };
      const onEnd = (e: Event) => {
        const el = e.target as HTMLElement;
        if (el.classList?.contains("pressed")) el.classList.remove("pressed");
      };
      content.addEventListener("click", onDown);
      content.addEventListener("animationend", onEnd);
      disposers.push(() => {
        content.removeEventListener("click", onDown);
        content.removeEventListener("animationend", onEnd);
      });

      return () => disposers.forEach((d) => d());
    },
    [btnClass],
  );

  useBlueprintContent(init);
}
