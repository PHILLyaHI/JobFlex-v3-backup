// SUBSCRIPTION — BLUEPRINT · the ported <script>.
// Route: /dashboard/subscription-blueprint.
//
// Every behavior the mockup's single <script> block owns, minus the pieces
// that belong to the app shell, with one teardown that removes every listener,
// cancels every rAF and disconnects every IntersectionObserver.
//
// PORTED HERE
//   · banner dismiss (`te`)          — measured height collapse + .hidden
//   · usage bar fill (`fill`)        — IntersectionObserver, 250ms, then width
//   · `subLayoutSync`                — billing card matches usage card height
//   · MOTION SYSTEM "BALANCED":      reveal cascade (scroll-velocity aware),
//                                    KPI count-up (`frame`), `pressify`
//
// DISCARDED, BECAUSE THE SHELL ALREADY DOES IT — verified in
// blueprint-shell/shell-behavior.ts, not assumed:
//   · `moveIndicator` + the .sb-link click handlers  → shell (sliding plate)
//   · `drawer` / `close` + the injected .nav-backdrop → shell (#sbOverlay)
//   · the .sb-sec-label/.sb-link entry cascade        → shell, first load only
//   · the graph-paper `--gy` parallax on .main        → shell
//   · press feedback on .sb-foot-ic / .sb-foot-acc    → shell
//   · `fluidScale` — the shell runs the same 1728/0.78/1.35 curve, and better:
//     it writes `zoom` to the SHELL ROOT rather than document.documentElement
//     so it cannot leak into the rest of the app, adds a ≤860px reset to 1, and
//     publishes --app-h because 100vh drifts under zoom. Re-running the
//     source's copy would fight it. (src/components/v3/fluid-scale.tsx is the
//     standalone version of the same thing, for pages outside the shell.)
//
// NOT PORTED, BECAUSE IT HAS NOTHING TO ACT ON
//   · `animateRows` + its MutationObserver — it targets #weekList, #jobsList
//     and #actList, three dashboard lists that do not exist on this page. The
//     repo's shared replacement, blueprint-shell/list-motion.ts `staggerIn`,
//     is there if a list is ever added.
//   · the `window.matchMedia` polyfill shim — every browser Next supports has
//     matchMedia. The `safe()` idea it guarded is kept in spirit: each block
//     below is independent, so one failing cannot take the others down.
//
// REDUCED MOTION is honoured exactly as authored: the whole motion block
// returns early, and the usage bars fill instantly instead of animating.

import styles from "./subscription.module.css";

/** Selector for one of the module's hashed classes, by its SOURCE name. */
const c = (n: string) => "." + styles[n];

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initSubscriptionContent(content: HTMLElement): () => void {
  const disposers: Array<() => void> = [];
  const on = (t: EventTarget, ev: string, fn: EventListener, o?: AddEventListenerOptions) => {
    t.addEventListener(ev, fn, o);
    disposers.push(() => t.removeEventListener(ev, fn, o));
  };
  const $ = (sel: string) => content.querySelector<HTMLElement>(sel);
  const $$ = (sel: string) => Array.from(content.querySelectorAll<HTMLElement>(sel));

  // ================= DISMISS THE PLAN-LIMIT BANNER =================
  // Плавное схлопывание высоты + гэпа — a smooth collapse of the height AND of
  // the flex gap between blocks (.banner.closing carries
  // margin-bottom: -22px to cancel .content's gap).
  //
  // Imperative, and that is deliberate rather than lazy: the collapse measures
  // offsetHeight and then transitions to 0, and the reveal cascade writes `rv`
  // / `rv-in` onto this same element. If `closing` / `hidden` came from React
  // state the className prop would change mid-transition and React would
  // rewrite the whole attribute, wiping the cascade's classes and making the
  // banner vanish instead of collapse. Keeping React's className prop constant
  // is what keeps the two systems out of each other's way.
  $$(c("banner-close")).forEach((btn) => {
    on(btn, "click", () => {
      const b = btn.closest<HTMLElement>(c("banner"));
      if (!b || b.classList.contains(styles["closing"])) return;
      if (reduced()) {
        b.classList.add(styles["hidden"]);
        return;
      }
      b.style.height = b.offsetHeight + "px";
      b.style.transitionDelay = "0ms";
      const r1 = requestAnimationFrame(() => {
        const r2 = requestAnimationFrame(() => {
          b.classList.add(styles["closing"]);
          b.style.height = "0px";
        });
        disposers.push(() => cancelAnimationFrame(r2));
      });
      disposers.push(() => cancelAnimationFrame(r1));
      const te = (e: Event) => {
        if ((e as TransitionEvent).propertyName !== "height") return;
        b.classList.add(styles["hidden"]);
        b.removeEventListener("transitionend", te);
      };
      on(b, "transitionend", te);
    });
  });

  // ================= USAGE BARS =================
  // The widths live on data-w and are written to style.width, never to JSX, so
  // a later React render cannot undo them: React only touches attributes it
  // owns, and it never sets `style` on these spans.
  (function () {
    const list = $("#usList");
    if (!list) return;
    const fills = Array.from(list.querySelectorAll<HTMLElement>(c("us-fill")));
    const fill = () => {
      fills.forEach((f) => {
        f.style.width = f.dataset.w + "%";
      });
    };
    if (reduced()) {
      fill();
      return;
    }
    let timer = 0;
    const io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          if (e.isIntersecting) {
            timer = window.setTimeout(fill, 250);
            io.disconnect();
          }
        });
      },
      { threshold: 0.3 },
    );
    io.observe(list);
    disposers.push(() => {
      io.disconnect();
      window.clearTimeout(timer);
    });
  })();

  // ================= USAGE / BILLING HEIGHT SYNC =================
  // Above 1220px the two cards sit side by side and the shorter one is padded
  // to match; below it they stack and the floor is released.
  const subLayoutSync = () => {
    const a = $("#usageCard");
    const b = $("#billCard");
    if (!a || !b) return;
    b.style.minHeight = "";
    if (window.innerWidth > 1220) b.style.minHeight = a.offsetHeight + "px";
  };
  // The source binds this to `load` ONLY, and gets away with it because its
  // script is inline in the document: `load` is always still to come. Neither
  // half of that holds here. `load` never fires on a client-side navigation,
  // and on a hard load React can hydrate — and run this module — AFTER `load`
  // has already gone. Measured, that is not theoretical: the immediate call
  // lands before the web fonts do and reads the usage card at 472px instead of
  // its settled 452px, which padded the billing card 20px too tall.
  //
  // So: measure now (the client-nav path, where fonts are already resident),
  // keep `load` (harmless when it still fires), and add `document.fonts.ready`
  // — the guarantee the source was actually relying on `load` for. Same device
  // dashboard-blueprint/blueprint-behavior.ts uses for its own layoutSync.
  let alive = true;
  subLayoutSync();
  on(window, "load", subLayoutSync);
  on(window, "resize", subLayoutSync);
  document.fonts?.ready.then(() => {
    if (alive) subLayoutSync();
  });
  disposers.push(() => {
    alive = false;
    const b = $("#billCard");
    if (b) b.style.minHeight = "";
  });

  // ================= REDUCED MOTION — the source's own gap, closed =========
  // The markup carries `rv` (opacity 0, translateY(14px)) on all seven blocks,
  // and the motion block below returns early under
  // `prefers-reduced-motion: reduce` — so opening the mockup with reduced
  // motion on gives you a BLANK PAGE: nothing ever adds `rv-in`. That is a bug
  // in the source, not a design decision, and DESIGN.md's standing
  // reduced-motion commitment makes shipping it not an option. Park those
  // blocks in their FINAL state instead: no animation runs, everything is
  // readable. Exactly the resolution manual-blueprint's use-reveal.ts uses.
  // Described, not silently "improved" — it is called out in the port report.
  if (reduced()) {
    const parked = $$(".rv");
    parked.forEach((el) => el.classList.add("rv-in"));
    disposers.push(() => parked.forEach((el) => el.classList.remove("rv-in")));
  }

  // ================= MOTION SYSTEM — BALANCED (пакет 02) =================
  (function () {
    if (reduced()) return;

    // Reveal: загрузка + скролл.
    // Reveal адаптируется к скорости скролла: медленный скролл — полная
    // анимация 420ms; быстрый — короткая (до 200ms): не отстаёт, но видима.
    // (Reveal adapts to scroll speed: slow scrolling gets the full 420ms;
    // fast scrolling gets a shorter one — it keeps up but stays visible.)
    const vpH = window.innerHeight;
    const scrollHost = content.closest<HTMLElement>(".main");
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

    // The source walks `.content > *`. Two of this page's `.content` children
    // are not blocks — the icon sprite (an out-of-flow SVGElement) and the
    // <noscript> — and including either would shift every stagger index after
    // it. `instanceof HTMLElement` drops the sprite; the tag check drops the
    // noscript.
    const blocks = Array.from(content.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.tagName !== "NOSCRIPT",
    );
    blocks.forEach((el, i) => {
      el.classList.add("rv");
      const initial = el.getBoundingClientRect().top < vpH;
      if (!initial) el.dataset.rvScroll = "1";
      el.style.transitionDelay = initial ? i * 60 + "ms" : "200ms";
    });
    const cells = $$(c("kpi"));
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
            // (below the fold: duration follows the current scroll speed)
            const dur = Math.round(Math.max(550, 900 - scrollVel * 160));
            target.style.transitionDuration = dur + "ms";
          }
          target.classList.add("rv-in");
          io.unobserve(target);
          const te = () => {
            target.style.transitionDelay = "";
            target.style.transitionDuration = "";
            target.removeEventListener("transitionend", te);
          };
          target.addEventListener("transitionend", te);
        });
      },
      { threshold: 0, rootMargin: "0px 0px 60px 0px" },
    );
    blocks.concat(cells).forEach((el) => io.observe(el));
    disposers.push(() => {
      io.disconnect();
      blocks.concat(cells).forEach((el) => {
        el.classList.remove("rv", "rv-in", "rv-cell");
        delete el.dataset.rvScroll;
        el.style.transitionDelay = "";
        el.style.transitionDuration = "";
      });
    });

    // (Каскад сайдбара и параллакс миллиметровки живут в шелле.)
    // (The sidebar cascade and the graph-paper parallax live in the shell.)

    // Каунт-ап KPI — the three Refer & earn figures.
    const rafs: number[] = [];
    $$(c("kpi-val")).forEach((el) => {
      const raw = (el.textContent || "").trim();
      const money = raw.charAt(0) === "$";
      const target = parseInt(raw.replace(/[^0-9]/g, ""), 10);
      if (!isFinite(target)) return;
      let t0: number | null = null;
      const frame = (t: number) => {
        if (!t0) t0 = t;
        const pr = Math.min(1, (t - t0) / 750);
        const e = 1 - Math.pow(1 - pr, 3);
        // toLocaleString is client-only by construction — this whole module
        // runs from a layout effect — so it cannot cause a hydration mismatch.
        el.textContent = (money ? "$" : "") + Math.round(target * e).toLocaleString("en-US");
        if (pr < 1) rafs.push(requestAnimationFrame(frame));
      };
      rafs.push(requestAnimationFrame(frame));
      disposers.push(() => {
        el.textContent = raw;
      });
    });
    disposers.push(() => rafs.forEach((r) => cancelAnimationFrame(r)));

    // Пресс-эффекты (press feedback).
    function pressify(sel: string, cls: string) {
      $$(sel).forEach((el) => {
        on(el, "click", () => {
          el.classList.remove(cls);
          void el.offsetWidth;
          el.classList.add(cls);
        });
        on(el, "animationend", () => el.classList.remove(cls));
      });
    }
    pressify(
      [c("btn"), c("icon-btn"), c("card-foot-btn"), c("dd-item")].join(", "),
      styles["pressed"],
    );
    pressify(c("week-strip") + " " + c("day"), styles["day-pressed"]);
  })();

  return () => disposers.forEach((d) => d());
}
