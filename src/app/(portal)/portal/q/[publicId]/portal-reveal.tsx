"use client";

// PUBLIC PROPOSAL PORTAL — the donor's entrance script, and nothing else.
// Route: /portal/q/[publicId].
//
// A line-for-line port of the IIFE at the bottom of
// `jobflex-proposal-client-blueprint (3).html`: the first two `.rv` blocks are
// revealed on a fixed 90ms / 200ms timer, every later one waits for an
// IntersectionObserver at threshold .12 and unobserves itself once it fires.
// Reduced motion — or a browser without IntersectionObserver — reveals all of
// them immediately, exactly as the donor does.
//
// THIS RENDERS NOTHING. The `.rv` blocks are server-rendered by page.tsx (they
// are the header, the intro, the three sections, the call-out and the footer),
// so the only client-side work is adding `.on` to them. The query is scoped to
// `.jf-proposal-portal` rather than the donor's bare `document` so it cannot
// reach a `.rv` belonging to some other surface after a client-side
// navigation.
//
// WORTH KNOWING: `.rv`'s own transition references `var(--ease-out)`, which the
// donor never declares — so the shorthand is invalid and there is NO
// transition. Adding `.on` snaps. That is the donor's real behaviour and it is
// preserved deliberately; see the header of ./proposal-portal.css.

import { useEffect } from "react";

const LEAD_IN_MS = 90;
const STAGGER_MS = 110;
/** The donor primes this many blocks on a timer; the rest wait for the observer. */
const PRIMED = 2;

export function PortalReveal() {
  useEffect(() => {
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".jf-proposal-portal .rv"),
    );
    if (!items.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      items.forEach((e) => e.classList.add("on"));
      return () => items.forEach((e) => e.classList.remove("on"));
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add("on");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12 },
    );

    const timers: number[] = [];
    items.forEach((e, i) => {
      if (i < PRIMED) {
        timers.push(
          window.setTimeout(() => e.classList.add("on"), LEAD_IN_MS + i * STAGGER_MS),
        );
      } else {
        io.observe(e);
      }
    });

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      io.disconnect();
      items.forEach((e) => e.classList.remove("on"));
    };
  }, []);

  return null;
}
