"use client";

/* Landing behavior — PORT of the donor <script> in `jobflex-landing (21).html`.
 *
 * The donor ships six `safe()` blocks: reveal, estsec, nav, scrollfx, countup,
 * tilt. Five of them are here, behavior-for-behavior. The sixth — `nav`, the
 * burger — is NOT: it opened the mobile menu by writing seven inline styles
 * onto `.nav-links` and closing it with `removeAttribute('style')`. Inline
 * style mutation is not how React drives a component, so it became real state
 * in landing-content.tsx plus one `.nav-links.open` class carrying the same
 * seven declarations. Rendered result is indistinguishable.
 *
 * Two other deliberate deviations, both required by the framework:
 *
 * 1. The donor's `window.matchMedia` polyfill shim is dropped. Every browser
 *    Next.js supports has matchMedia; the shim only existed for the donor's
 *    "open the file anywhere" life. The `safe()` idea it sat next to is KEPT —
 *    one throwing block must not take the other four down with it.
 * 2. Queries are scoped to the page root rather than `document`. Every target
 *    lives inside `.jf-landing`, so the result is the same, and in an SPA it
 *    means this hook can never reach into another route's DOM.
 *
 * Full teardown on unmount is mandatory here: every listener is removed, every
 * rAF cancelled, both IntersectionObservers disconnected, and `--par` — the
 * parallax offset `scrollfx` writes onto document.documentElement — is deleted.
 * Nothing this hook wrote survives a navigation away.
 *
 * Every `prefers-reduced-motion: reduce` guard the donor had is preserved:
 * estsec, countup and tilt all no-op under it, and scrollfx still moves the
 * progress bar and the nav shadow but stops writing `--par`.
 */

import { useEffect, type RefObject } from "react";

/** Donor helper: one throwing block must not take down the others. */
function safe(name: string, fn: () => void | (() => void)): (() => void) | void {
  try {
    return fn();
  } catch (e) {
    console.warn("[" + name + "]", e);
  }
}

export function useLandingBehavior(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];
    const add = (c: (() => void) | void) => {
      if (c) cleanups.push(c);
    };

    /* ── reveal ─────────────────────────────────────────────────────────
       The `.rv` entrance cascade. Staggered by DOM index, capped at 6 steps,
       one-shot per element (unobserve on first intersection). */
    add(
      safe("reveal", () => {
        const io = new IntersectionObserver(
          function (es) {
            es.forEach(function (e) {
              if (e.isIntersecting) {
                e.target.classList.add("on");
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
        );
        root.querySelectorAll<HTMLElement>(".rv").forEach(function (el, i) {
          el.style.transitionDelay = Math.min(i, 6) * 60 + "ms";
          io.observe(el);
        });
        return () => io.disconnect();
      }),
    );

    /* ── estsec ─────────────────────────────────────────────────────────
       The "47s" proposal timer in the live-estimate card head counts up once
       on load over 1400ms, cubic ease-out. Reduced motion: leaves the static
       47s. textContent is mutated directly, as the donor does — React never
       rewrites that node because its rendered children ("47s") never change
       between renders. */
    add(
      safe("estsec", () => {
        const el = root.querySelector<HTMLElement>(".fh-sec");
        if (!el) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const T = 1400;
        let t0: number | null = null;
        let raf = 0;
        function step(ts: number) {
          if (!t0) t0 = ts;
          const k = Math.min(1, (ts - t0) / T);
          const e = 1 - Math.pow(1 - k, 3);
          el!.textContent = Math.round(47 * e) + "s";
          if (k < 1) raf = requestAnimationFrame(step);
        }
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
      }),
    );

    /* ── scrollfx ───────────────────────────────────────────────────────
       Three things off one rAF-throttled passive scroll listener: the
       `.sprog` read-progress bar under the nav, the nav's hard offset shadow
       past 6px, and the `--par` background parallax offset. `--par` is the one
       write that escapes this subtree — it goes on documentElement so the
       fixed-attachment section grids can read it — so it is explicitly removed
       on unmount. Under reduced motion the bar and shadow still work; only the
       parallax stops. */
    add(
      safe("scrollfx", () => {
        const nav = root.querySelector<HTMLElement>(".nav");
        const bar = root.querySelector<HTMLElement>(".sprog");
        const html = document.documentElement;
        const rm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let tick = false;
        let raf = 0;
        function apply() {
          tick = false;
          const y = window.scrollY || html.scrollTop || 0;
          const max = Math.max(1, html.scrollHeight - window.innerHeight);
          if (bar) bar.style.transform = "scaleX(" + Math.min(1, y / max) + ")";
          if (nav) nav.classList.toggle("sc", y > 6);
          if (!rm) html.style.setProperty("--par", (y * -0.06).toFixed(1) + "px");
        }
        function onScroll() {
          if (!tick) {
            tick = true;
            raf = requestAnimationFrame(apply);
          }
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        apply();
        return () => {
          window.removeEventListener("scroll", onScroll);
          cancelAnimationFrame(raf);
          html.style.removeProperty("--par");
        };
      }),
    );

    /* ── countup ────────────────────────────────────────────────────────
       The three `.stat b` figures (43 / 2,100 / 47 sec) roll up from zero the
       first time they scroll into view, 750ms cubic ease-out, keeping whatever
       suffix followed the number. Skipped entirely under reduced motion, which
       leaves the real figures on screen. toLocaleString runs only inside this
       effect, so it can never produce a hydration mismatch. */
    add(
      safe("countup", () => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const els = root.querySelectorAll<HTMLElement>(".stat b");
        if (!els.length) return;
        const rafs = new Set<number>();
        const io = new IntersectionObserver(
          function (es) {
            es.forEach(function (e) {
              if (!e.isIntersecting) return;
              io.unobserve(e.target);
              const el = e.target as HTMLElement;
              const raw = el.textContent || "";
              const m = raw.match(/^([\d,]+)(.*)$/);
              if (!m) return;
              const target = parseInt(m[1].replace(/,/g, ""), 10);
              const suf = m[2];
              const T = 750;
              let t0: number | null = null;
              function step(ts: number) {
                if (!t0) t0 = ts;
                const k = Math.min(1, (ts - t0) / T);
                const ease = 1 - Math.pow(1 - k, 3);
                el.textContent = Math.round(target * ease).toLocaleString("en-US") + suf;
                if (k < 1) rafs.add(requestAnimationFrame(step));
              }
              el.textContent = "0" + suf;
              rafs.add(requestAnimationFrame(step));
            });
          },
          { threshold: 0.5 },
        );
        els.forEach(function (el) {
          io.observe(el);
        });
        return () => {
          io.disconnect();
          rafs.forEach((id) => cancelAnimationFrame(id));
        };
      }),
    );

    /* ── tilt ───────────────────────────────────────────────────────────
       ±2.2deg pointer tilt on the estimate card, fine-pointer devices only —
       the donor gates on `(hover: hover) and (pointer: fine)` so touch never
       gets a stuck transform. Reduced motion skips it. */
    add(
      safe("tilt", () => {
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        const zone = root.querySelector<HTMLElement>(".hero-r-inner");
        const card = root.querySelector<HTMLElement>(".fh-card");
        if (!zone || !card) return;
        function onMove(ev: PointerEvent) {
          const r = zone!.getBoundingClientRect();
          const dx = (ev.clientX - r.left) / r.width - 0.5;
          const dy = (ev.clientY - r.top) / r.height - 0.5;
          card!.style.transform =
            "rotateX(" + (-dy * 2.2).toFixed(2) + "deg) rotateY(" + (dx * 2.2).toFixed(2) + "deg)";
        }
        function onLeave() {
          card!.style.transform = "";
        }
        zone.addEventListener("pointermove", onMove);
        zone.addEventListener("pointerleave", onLeave);
        return () => {
          zone.removeEventListener("pointermove", onMove);
          zone.removeEventListener("pointerleave", onLeave);
          card.style.transform = "";
        };
      }),
    );

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [rootRef]);
}
