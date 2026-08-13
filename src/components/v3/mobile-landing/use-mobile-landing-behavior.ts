"use client";

/* Handheld landing behavior — the desktop page's interaction set, ported
 * effect for effect from `src/components/v3/landing/use-landing-behavior.ts`,
 * with the same timings, the same easings and the same reduced-motion guards.
 *
 * The desktop hook ships five live blocks (the sixth, the burger, is React
 * state there and here). Four are carried over unchanged in behavior:
 *
 *   reveal    IntersectionObserver on `.ml-rv`, threshold 0.12,
 *             rootMargin "0px 0px -40px 0px", DOM-index stagger capped at
 *             6 x 60ms, one-shot (unobserve on first intersection).
 *   estsec    the "47s" figure in the estimate head counts up once on load,
 *             1400ms, cubic ease-out.
 *   scrollfx  one rAF-throttled passive scroll listener driving three things:
 *             the read-progress bar, the nav's hard offset shadow past 6px,
 *             and the graph-paper parallax offset.
 *   countup   the three `.ml-stat b` figures (43 / 2,100 / 47 sec) roll from
 *             zero the first time they scroll into view, 750ms cubic ease-out,
 *             keeping whatever suffix followed the number.
 *
 * TWO DELIBERATE DEVIATIONS, both about the pointer:
 *
 * 1. `tilt` is NOT ported. The desktop block rotates the estimate card +-2.2deg
 *    to follow a mouse, and it is gated on
 *    `(hover: hover) and (pointer: fine)` precisely so a touch device never
 *    gets a stuck transform. On a handheld-only surface that gate is false by
 *    construction, so porting it would ship dead code whose only possible
 *    effect is the bug it exists to prevent. The hover -> press adaptation of
 *    the rest of the page is done in CSS instead: every `:hover` state on the
 *    desktop sheet becomes an `:active` stamp here (travel down-right by
 *    exactly what the offset shadow gives up).
 *
 * 2. The parallax custom property is `--ml-par`, not the desktop's `--par`.
 *    It is written on `document.documentElement`, which makes it a
 *    document-global name in the same sense as an element id or a @keyframes
 *    name. The responsive switch mounts exactly one of the two trees, so a
 *    clash is not reachable today — the prefix keeps it unreachable if that
 *    ever changes.
 *
 * TEARDOWN is total, and has to be: this hook writes one property outside its
 * own subtree. On unmount every listener is removed, every rAF is cancelled,
 * both observers are disconnected, and `--ml-par` is deleted from <html>.
 */

import { useEffect, type RefObject } from "react";

/** Donor helper: one throwing block must not take down the other three. */
function safe(name: string, fn: () => void | (() => void)): (() => void) | void {
  try {
    return fn();
  } catch (e) {
    console.warn("[" + name + "]", e);
  }
}

const REDUCED = "(prefers-reduced-motion: reduce)";

export function useMobileLandingBehavior(rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const cleanups: Array<() => void> = [];
    const add = (c: (() => void) | void) => {
      if (c) cleanups.push(c);
    };

    /* ── reveal ─────────────────────────────────────────────────────────
       Kept live under reduced motion on purpose: the CSS media query already
       parks `.ml-rv` at its resting values, so adding `.on` changes nothing
       visible, and the feature rows' sky edge reads its state from the same
       class. Skipping the observer instead would leave that edge unpainted. */
    add(
      safe("reveal", () => {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
              if (e.isIntersecting) {
                e.target.classList.add("on");
                io.unobserve(e.target);
              }
            });
          },
          { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
        );
        root.querySelectorAll<HTMLElement>(".ml-rv").forEach((el, i) => {
          el.style.transitionDelay = Math.min(i, 6) * 60 + "ms";
          io.observe(el);
        });
        return () => io.disconnect();
      }),
    );

    /* ── estsec ─────────────────────────────────────────────────────────
       textContent is mutated directly, as the desktop hook does: React never
       rewrites that node, because its rendered children ("47s") never change
       between renders. Reduced motion leaves the static 47s on screen. */
    add(
      safe("estsec", () => {
        const el = root.querySelector<HTMLElement>(".ml-fh-sec");
        if (!el) return;
        if (window.matchMedia(REDUCED).matches) return;
        const T = 1400;
        let t0: number | null = null;
        let raf = 0;
        const step = (ts: number) => {
          if (!t0) t0 = ts;
          const k = Math.min(1, (ts - t0) / T);
          const e = 1 - Math.pow(1 - k, 3);
          el.textContent = Math.round(47 * e) + "s";
          if (k < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
      }),
    );

    /* ── scrollfx ───────────────────────────────────────────────────────
       Under reduced motion the progress bar and the nav shadow still work —
       they report position, they are not decoration — and only the parallax
       write stops, which is the same split the desktop hook makes. */
    add(
      safe("scrollfx", () => {
        const nav = root.querySelector<HTMLElement>(".ml-nav");
        const bar = root.querySelector<HTMLElement>(".ml-sprog");
        const html = document.documentElement;
        const rm = window.matchMedia(REDUCED).matches;
        let tick = false;
        let raf = 0;
        const apply = () => {
          tick = false;
          const y = window.scrollY || html.scrollTop || 0;
          const max = Math.max(1, html.scrollHeight - window.innerHeight);
          if (bar) bar.style.transform = "scaleX(" + Math.min(1, y / max) + ")";
          if (nav) nav.classList.toggle("sc", y > 6);
          if (!rm) html.style.setProperty("--ml-par", (y * -0.06).toFixed(1) + "px");
        };
        const onScroll = () => {
          if (!tick) {
            tick = true;
            raf = requestAnimationFrame(apply);
          }
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        apply();
        return () => {
          window.removeEventListener("scroll", onScroll);
          cancelAnimationFrame(raf);
          html.style.removeProperty("--ml-par");
        };
      }),
    );

    /* ── countup ────────────────────────────────────────────────────────
       Skipped entirely under reduced motion, which leaves the real figures on
       screen. toLocaleString runs only inside this effect, so it can never
       produce a hydration mismatch. */
    add(
      safe("countup", () => {
        if (window.matchMedia(REDUCED).matches) return;
        const els = root.querySelectorAll<HTMLElement>(".ml-stat b");
        if (!els.length) return;
        const rafs = new Set<number>();
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((e) => {
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
              const step = (ts: number) => {
                if (!t0) t0 = ts;
                const k = Math.min(1, (ts - t0) / T);
                const ease = 1 - Math.pow(1 - k, 3);
                el.textContent = Math.round(target * ease).toLocaleString("en-US") + suf;
                if (k < 1) rafs.add(requestAnimationFrame(step));
              };
              el.textContent = "0" + suf;
              rafs.add(requestAnimationFrame(step));
            });
          },
          { threshold: 0.5 },
        );
        els.forEach((el) => io.observe(el));
        return () => {
          io.disconnect();
          rafs.forEach((id) => cancelAnimationFrame(id));
        };
      }),
    );

    return () => {
      cleanups.forEach((c) => c());
    };
  }, [rootRef]);
}
