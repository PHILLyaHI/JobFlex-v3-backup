"use client";

/* JobFlex landing — Version B · behaviour.
 *
 * Three jobs, and deliberately no more. This is a static marketing page;
 * anything that is not motion or a menu belongs in CSS.
 *
 *   1. reveal-on-scroll — adds `is-in` to every `.lb-rv` once, in view.
 *   2. nav elevation    — reports whether the page has scrolled off the top.
 *   3. the total count-up in the hero estimate.
 *
 * Progressive enhancement, on purpose:
 *   - `.lb-rv` is hidden by CSS only inside `@media (scripting: enabled)`,
 *     so with JS off nothing is ever left invisible and there is no
 *     first-paint flash from a JS-applied class.
 *   - the estimate total is SERVER-RENDERED at its final value. The count-up
 *     only overwrites it on the client, and the row it lives in is held at
 *     opacity 0 by an `animation-delay` for longer than the count takes to
 *     start, so the reset to zero is never on screen.
 *   - `prefers-reduced-motion: reduce` short-circuits every one of them; the
 *     CSS disables its own animations under the same query.
 */

import { useEffect, useState } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(REDUCE).matches;
}

/** Reveal-on-scroll. Fires once per element and then stops observing it. */
export function useLandingBReveal(rootRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = Array.from(root.querySelectorAll<HTMLElement>(".lb-rv"));
    if (targets.length === 0) return;

    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-in"));
      return;
    }

    // The hidden state lives behind this attribute, and only this line ever
    // sets it — so the CSS can only hide content once we have CONFIRMED we are
    // able to bring it back. If JS never runs, is still parsing, or the reader
    // has reduced motion on, the page renders fully visible. The animation
    // cannot eat the content; on a marketing page that is a revenue bug, not a
    // polish bug.
    root.setAttribute("data-rv-ready", "");

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      },
      // Trip a little before the block reaches the fold, so the motion has
      // finished by the time the reader's eye actually arrives.
      { threshold: 0, rootMargin: "0px 0px -6% 0px" },
    );
    targets.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      // Drop the attribute with the observer that honours it. A StrictMode
      // remount, or a client-side navigation away, would otherwise leave the
      // hidden state set with nothing left running to clear it.
      root.removeAttribute("data-rv-ready");
    };
  }, [rootRef]);
}

/** True once the document has scrolled past the floating nav's resting gap. */
export function useLandingBScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [threshold]);
  return scrolled;
}

const money = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(n: number) {
  return money.format(n);
}

/**
 * Count-up for the estimate total. `initial` is what the server printed, and
 * what a reduced-motion or no-JS reader keeps.
 */
export function useLandingBCountUp(target: number, delayMs: number, durationMs = 860) {
  const [text, setText] = useState(() => formatMoney(target));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    let start = 0;

    // No synchronous reset to zero here — that would be a setState in the
    // effect body (a cascading render) and it is not needed: the first
    // animation frame already writes ~0.00, and by then `delayMs` has not
    // elapsed, so the row is still held invisible by its animation-delay.
    const step = (now: number) => {
      if (start === 0) start = now;
      const t = Math.min(1, (now - start) / durationMs);
      // easeOutCubic — fast settle, no overshoot on a money figure.
      const eased = 1 - Math.pow(1 - t, 3);
      setText(formatMoney(target * eased));
      if (t < 1) raf = window.requestAnimationFrame(step);
    };

    const timer = window.setTimeout(() => {
      raf = window.requestAnimationFrame(step);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      if (raf !== 0) window.cancelAnimationFrame(raf);
    };
  }, [target, delayMs, durationMs]);

  return text;
}
