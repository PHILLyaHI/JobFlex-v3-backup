"use client";

// SMART PROPOSAL · ESTIMATE / BLUEPRINT — the donor's MOTION SYSTEM —
// BALANCED (пакет 02).
//
// The donor's motion IIFE, ported with its exact numbers: the block reveal with
// its scroll-velocity-adaptive duration, and press feedback on `.btn`.
//
// WHAT IS DROPPED, AND WHY
//   · the sidebar cascade, the graph-paper parallax and FLUID SCALE belong to
//     the PERSISTENT chrome and already run from
//     blueprint-shell/shell-behavior.ts, at the same donor values;
//   · the `.kpi` / `.rv-cell` second reveal layer and the 750ms count-up on
//     `.kpi-val` — this page renders no KPI strip (the donor carries the block
//     because its stylesheet is the shared dashboard one);
//   · `animateRows` over #weekList / #jobsList / #actList — none of those three
//     lists exist on this page, for the same reason;
//   · `pressify('.week-strip .day', 'day-pressed')` — no week strip here.
//
// ONE DELIBERATE DEPARTURE, noted at its site below: the press binding is
// delegated rather than bound per element, because the refine card swaps
// between its idle / busy / diff stages and `pressify()` would only ever have
// bound the buttons present at mount.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

/**
 * @param btnClass this module's hashed `.btn` class — press feedback is
 *   delegated, so it needs the class to test against.
 * @param stage the page's current panel. Included as a dependency ON PURPOSE:
 *   this page is a two-step flow (intake console → estimate), and each step
 *   replaces every child of `.content`. Re-running the init on the change is
 *   what gives the new panel the donor's entrance instead of having it appear
 *   hard — and `useBlueprintContent` resets `.main` scrollTop on the way in,
 *   which is exactly right when moving from a form to a long estimate.
 */
export function useSmartProposalMotion(btnClass: string, stage: string) {
  // Stable for the life of a stage: useBlueprintContent re-runs whenever `init`
  // changes identity, and both deps below are constants within a stage.
  const init = useCallback(
    (content: HTMLElement) => {
      const disposers: Array<() => void> = [];

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};

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

      // Пресс-эффекты
      //
      // DEPARTURE FROM THE DONOR: `pressify()` binds to the elements that exist
      // at init, so Keep changes / Discard — which only ever appear after the
      // refine card reaches its diff stage — would never have been bound at
      // all. Delegating from `.content` keeps every `.btn` pressing, which is
      // plainly what the donor's selector list intends. Same class, same
      // `press2` keyframe, same 0.18s.
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
    // `stage` is a RESET KEY, not a value the body reads — which is why
    // exhaustive-deps flags it as unnecessary and why the disable is correct
    // rather than a workaround. Changing panel replaces every child of
    // `.content`; re-running the init is what re-primes and re-observes the new
    // ones. Dropping it would leave the second panel with no entrance at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [btnClass, stage],
  );

  useBlueprintContent(init);
}
