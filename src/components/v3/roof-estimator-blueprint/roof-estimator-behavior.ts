// Roof estimator blueprint — page-level MOTION only.
//
// This module used to be the page: it rendered the donor's samples, the fake
// measuring progress bar, the hero figures, the linear-footage list, the pitch
// mix and the estimate table out of a demo fixture, and mounted the two roof
// viewers as islands pointed at that same fixture. All of it is gone. The page
// now mounts the real RoofEstimatorForm (see roof-estimator-content.tsx), which
// owns every control, every server action and every value on the screen.
//
// What is left is the one thing the mounted form does NOT own: the donor's
// arrival cascade over `.content > *`, which every blueprint page plays on
// navigation, and the press feedback shared by `.btn`.
//
// Deliberately NOT ported back:
// - the row stagger's `new MutationObserver(() => animateRows(list))`. It fired
//   on every child change, so a React re-render inside the page would drop the
//   rows to opacity 0 and replay a 45ms-per-row entrance — the single most
//   expensive trap in this codebase (decisions.md, Session 3). Row-level
//   entrances belong to the component that renders the rows, and the form
//   already plays its own (framer-motion `listStagger` / `listItem`).
// - the donor's `.kpi` / `.kpi-val` layers and the banner dismisser: this page
//   has never had any of that markup.

export function initRoofEstimatorContent(content: HTMLElement): () => void {
  const root = content;
  const main = content.closest<HTMLElement>(".main");
  const disposers: Array<() => void> = [];
  const on = (
    target: EventTarget,
    ev: string,
    fn: EventListener,
    opts?: AddEventListenerOptions,
  ) => {
    target.addEventListener(ev, fn, opts);
    disposers.push(() => target.removeEventListener(ev, fn, opts));
  };
  const $$ = (sel: string) => Array.from(root.querySelectorAll<HTMLElement>(sel));

  // ================= MOTION SYSTEM — BALANCED (package 02) =================
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    // Reveal: load + scroll. Reveal adapts to scroll speed — a slow scroll gets
    // the full animation, a fast one a shorter pass.
    const vpH = window.innerHeight;
    const scrollHost = main;
    let velLastY = scrollHost ? scrollHost.scrollTop : 0;
    let velLastT = performance.now();
    let scrollVel = 0; // px/ms
    if (scrollHost)
      on(
        scrollHost,
        "scroll",
        () => {
          const now = performance.now();
          scrollVel = Math.abs(scrollHost.scrollTop - velLastY) / Math.max(1, now - velLastT);
          velLastY = scrollHost.scrollTop;
          velLastT = now;
        },
        { passive: true },
      );

    // Two blocks: the page head and the mounted estimator. Both are stable
    // elements React never swaps, so the classes set here survive every
    // re-render inside the form.
    const blocks = $$(".content > *");
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
            // below the fold: duration follows the current scroll speed
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

    // Press effect. DELEGATED rather than bound per element (the donor bound
    // each `.btn` once at init): every button on this page is now rendered by
    // React and changes identity whenever the flow advances, so listeners
    // attached at mount would cover the intake's buttons and nothing that
    // replaces them.
    on(root, "click", (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>(".btn");
      if (!el) return;
      el.classList.remove("pressed");
      void el.offsetWidth;
      el.classList.add("pressed");
    });
    on(root, "animationend", (e) => {
      const el = e.target;
      if (el instanceof HTMLElement) el.classList.remove("pressed");
    });
  }

  // (Sidebar cascade, the sliding active indicator, FLUID SCALE and the
  // graph-paper parallax all live in the shell — it owns `.main` and survives
  // navigation.)

  return () => {
    disposers.forEach((d) => d());
  };
}
