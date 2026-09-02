"use client";

// VIDEO ESTIMATOR / BLUEPRINT — the donor's MOTION SYSTEM — BALANCED (пакет 02).
//
// The donor's motion IIFE, ported with its exact numbers: the block reveal with
// its scroll-velocity-adaptive duration, and press feedback on `.btn`.
//
// WHAT IS DROPPED, AND WHY
//   · the sidebar cascade, the graph-paper parallax and FLUID SCALE belong to
//     the PERSISTENT chrome and already run from
//     blueprint-shell/shell-behavior.ts, at the same donor values;
//   · the `.kpi` / `.kpi-val` reveal layer and the 750ms count-up — this page
//     has no KPI strip (the donor carries the block because its stylesheet is
//     the shared dashboard one);
//   · `animateRows` over #weekList / #jobsList / #actList and
//     `pressify('.week-strip .day', …)` — none of those exist here either.
//
// ONE DELIBERATE DEPARTURE, noted at its site: the press binding is delegated,
// so controls that appear later (the whole result card, the review gate's
// Confirm / Discard) keep the effect. `pressify()` bound once at init would
// have given it only to the two buttons that exist before the analysis runs.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

/**
 * @param btnClass this module's hashed `.btn` class — press feedback is
 *   delegated, so it needs the class to test against.
 */
export function useVideoEstimatorMotion(btnClass: string) {
  // Referentially stable for the life of the mount: useBlueprintContent re-runs
  // — and would replay the whole entrance — on every identity change of `init`.
  // `btnClass` is a module constant, so the dep never moves.
  const init = useCallback(
    (content: HTMLElement) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

      const disposers: Array<() => void> = [];

      // Reveal: загрузка + скролл
      // Reveal адаптируется к скорости скролла: медленный скролл — полная
      // анимация 420ms; быстрый — короткая (до 200ms): не отстаёт, но видима.
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
              // элемент ниже фолда: длительность по текущей скорости скролла
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
      // The result block starts `hidden`, so it never intersects and stays at
      // `rv` opacity 0 until the analysis reveals it — which is exactly the
      // donor's behaviour, and why the element is kept mounted rather than
      // conditionally rendered.

      // Пресс-эффекты — delegated, see the header note.
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
