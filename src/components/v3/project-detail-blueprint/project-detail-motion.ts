"use client";

// PROJECT DETAIL / BLUEPRINT — the donor's MOTION SYSTEM — BALANCED (пакет 02).
//
// The donor's motion IIFE, ported with its exact numbers: the block reveal
// with its scroll-velocity-adaptive duration, the KPI cell run behind it, the
// 750ms cubic count-up on `.kpi-val`, and press feedback on `.btn`.
//
// WHAT IS DROPPED, AND WHY
//   · the sidebar cascade, the graph-paper parallax and FLUID SCALE belong to
//     the PERSISTENT chrome and already run from
//     blueprint-shell/shell-behavior.ts, at the same donor values;
//   · `animateRows` over #weekList / #jobsList / #actList — this page has none
//     of those three lists (the donor carries the block because its stylesheet
//     is the shared dashboard one);
//   · `pressify('.week-strip .day', 'day-pressed')` — no week strip here.
//
// ONE DELIBERATE DEPARTURE, both noted at their sites below: the press binding
// is delegated, and the count-up keeps whatever frames the number instead of
// rebuilding it from digits alone.

import { useCallback } from "react";
import { useBlueprintContent } from "@/components/v3/blueprint-shell/use-blueprint-content";

/**
 * @param btnClass this module's hashed `.btn` class — press feedback is
 *   delegated, so it needs the class to test against.
 * @param cellSelector the hashed `.kpi` selector for the second reveal layer.
 * @param valSelector the hashed `.kpi-val` selector for the count-up.
 */
export function useProjectDetailMotion(opts: {
  btnClass: string;
  cellClass: string;
  valClass: string;
}) {
  const { btnClass, cellClass, valClass } = opts;

  // Referentially stable for the life of the mount: useBlueprintContent re-runs
  // — and would replay the whole entrance — on every identity change of `init`.
  // The three class names are module constants, so the deps never move.
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
      const cells = Array.from(content.querySelectorAll<HTMLElement>("." + cellClass));
      cells.forEach((el, i) => {
        el.classList.add("rv-cell");
        const initial = el.getBoundingClientRect().top < vpH;
        if (!initial) el.dataset.rvScroll = "1";
        el.style.transitionDelay = initial ? 160 + (i % 8) * 45 + "ms" : "200ms";
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
      blocks.concat(cells).forEach((el) => io.observe(el));
      disposers.push(() => io.disconnect());
      // The attach panel starts `hidden`, so it never intersects and stays at
      // `rv` opacity 0 until it is opened — at which point the observer, which
      // is still watching it, fades it up. That is the donor's own behaviour,
      // preserved by keeping the element mounted rather than unmounting it.

      // Каунт-ап KPI
      //
      // DEPARTURE FROM THE DONOR, and the same one projects-behavior.ts makes:
      // the donor rebuilds the text from `raw.replace(/[^0-9]/g, '')`, which is
      // only safe for its own fixture ("$86,500", "6"). A real budget of
      // 1234.5 formats as "$1,234.50", whose digits alone are 123450 — the
      // strip would count up to "$123,450" and STAY there. So: keep whatever
      // frames the number and skip any value carrying a decimal. Integer
      // values — every value the donor has — animate identically.
      Array.from(content.querySelectorAll<HTMLElement>("." + valClass)).forEach((el) => {
        const raw = (el.textContent || "").trim();
        const m = raw.match(/^([^\d]*)(\d[\d,]*)([^\d]*)$/);
        if (!m) return;
        const [, prefix, digits, suffix] = m;
        const target = parseInt(digits.replace(/,/g, ""), 10);
        if (!isFinite(target)) return;
        let t0: number | null = null;
        function frame(t: number) {
          if (!t0) t0 = t;
          const pr = Math.min(1, (t - t0) / 750);
          const e = 1 - Math.pow(1 - pr, 3);
          el.textContent = prefix + Math.round(target * e).toLocaleString("en-US") + suffix;
          if (pr < 1) requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      });

      // Пресс-эффекты
      //
      // DEPARTURE FROM THE DONOR: `pressify()` binds to the elements that exist
      // at init, so the donor's own Attach buttons lose the effect the moment
      // `renderAvail()` rewrites the list — the first attach silently kills it
      // for the rest. Delegating from `.content` keeps every `.btn` pressing,
      // which is plainly what the donor's selector list intends. Same class,
      // same `press2` keyframe, same 0.18s.
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
    [btnClass, cellClass, valClass],
  );

  useBlueprintContent(init);
}
