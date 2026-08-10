"use client";

// HOMEOWNER LANDING — the donor's page-level `safe()` blocks, as React.
//
// Ported here: `reveal`, `parallax`, and the IntersectionObserver gate the
// `vignettes` and `count` blocks share. The `wizard` and `placeholder` blocks
// live with the wizard, in ./wizard/.
//
// Two donor conventions are preserved and one is dropped:
//   · KEPT — the `prefers-reduced-motion` guard. The donor reads it once into
//     `REDUCED` and branches on it in JS as well as CSS; every branch survives.
//     `DESIGN.md` makes reduced-motion a standing commitment, not a nicety.
//   · KEPT — `safe()`: one throwing behavior must not take down the others.
//   · DROPPED — the donor's `window.matchMedia` polyfill shim. Every browser
//     Next.js supports has had matchMedia for a decade.
//
// Everything acquired here is released on unmount: listeners removed, rAF
// cancelled, observers disconnected, and the `--gy` custom property deleted
// from the element the donor wrote it to.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** donor: `var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches`.
 *  Read inside effects and event handlers only, so SSR never touches `window`. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_QUERY).matches
  );
}

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * The same flag, but usable during render — which the vignettes and the count-up
 * need, because their reduced-motion branch is a DIFFERENT rendered value rather
 * than a skipped animation, and deriving it beats setting state from an effect.
 *
 * Renders `false` on the server, so the markup React sends and the markup it
 * hydrates agree; the real value lands on the first client render after that.
 * One deliberate improvement on the donor, which snapshots `REDUCED` once at
 * load: this tracks the OS setting live, so a visitor who turns reduced motion
 * on mid-page gets it without a reload.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false);
}

/** donor: `function safe(name, fn) { try { fn() } catch (e) { console.warn(…) } }` */
export function safe<T>(name: string, fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    console.warn("[" + name + "]", e);
    return undefined;
  }
}

/**
 * One-shot IntersectionObserver on an element looked up by id — the shape both
 * the donor's `vignettes` (`#steps`, threshold 0.15) and `count` (`#net`,
 * threshold 0.35) blocks use. Unobserves on the first intersection, exactly as
 * the donor does, so it can never fire twice.
 */
export function useInViewOnce(elementId: string, threshold: number): boolean {
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    if (seen) return;
    const teardown = safe("inView:" + elementId, () => {
      const host = document.getElementById(elementId);
      if (!host) return undefined;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            setSeen(true);
          });
        },
        { threshold }
      );
      io.observe(host);
      return () => io.disconnect();
    });
    return teardown;
  }, [elementId, threshold, seen]);

  return seen;
}

/**
 * donor `safe('reveal', …)` — one observer, threshold 0.12, rootMargin
 * `0px 0px -40px 0px`, `.on` added once and then unobserved.
 *
 * The donor adds the class with `classList.add`. Here it is React state
 * instead: several `.rv` elements (the steps grid, the coverage card) also
 * contain animating children, and any re-render of those would have wiped a
 * className React did not know about. `cls()` composes the donor's literal
 * class list — `sec-n rv on` — so the stylesheet is untouched.
 */
export function useReveal() {
  const [on, setOn] = useState<Record<string, boolean>>({});
  const observer = useRef<IntersectionObserver | null>(null);
  const keyOf = useRef(new Map<Element, string>());
  const waiting = useRef(new Set<Element>());
  const refs = useRef(new Map<string, (el: Element | null) => void>());

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const key = keyOf.current.get(e.target);
          if (key) setOn((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    observer.current = io;
    waiting.current.forEach((el) => io.observe(el));
    waiting.current.clear();
    return () => {
      io.disconnect();
      observer.current = null;
    };
  }, []);

  /** Stable per key — a fresh callback each render would detach/reattach. */
  const ref = useCallback((key: string) => {
    const cached = refs.current.get(key);
    if (cached) return cached;
    const fn = (el: Element | null) => {
      if (!el) return;
      keyOf.current.set(el, key);
      if (observer.current) observer.current.observe(el);
      else waiting.current.add(el);
    };
    refs.current.set(key, fn);
    return fn;
  }, []);

  const cls = useCallback(
    (key: string, base: string) => (on[key] ? base + " rv on" : base + " rv"),
    [on]
  );

  return { ref, cls };
}

/**
 * donor `safe('parallax', …)` — the drafting-grid drift behind the ink band.
 *
 * Note the donor writes `--gy` to the `#net` SECTION, not to
 * `document.documentElement`; `.net::before` / `.net::after` inherit it. It is
 * still removed on teardown, along with the scroll listener and any queued
 * frame, so nothing survives the unmount.
 */
export function useNetParallax() {
  useEffect(() => {
    const teardown = safe("parallax", () => {
      const band = document.getElementById("net");
      if (!band || prefersReducedMotion()) return undefined;

      let pending = false;
      let frame = 0;

      const apply = () => {
        pending = false;
        const r = band.getBoundingClientRect();
        if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
        band.style.setProperty("--gy", Math.round((window.innerHeight - r.top) * 0.06) + "px");
      };

      const onScroll = () => {
        if (pending) return;
        pending = true;
        frame = requestAnimationFrame(apply);
      };

      window.addEventListener("scroll", onScroll, { passive: true });
      apply();

      return () => {
        window.removeEventListener("scroll", onScroll);
        if (frame) cancelAnimationFrame(frame);
        band.style.removeProperty("--gy");
      };
    });
    return teardown;
  }, []);
}
