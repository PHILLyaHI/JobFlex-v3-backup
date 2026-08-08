"use client";

// WORKLIST — the seam crossing, animated.
//
// This is the page's one signature motion, so it gets its own module. When a
// card's done-condition is met it stops being drawn in the OPEN band and starts
// being drawn as a receipt in the SETTLED band. React moves the DOM node (the
// keys are stable) — and a moved node does not transition, it teleports. The
// eye reads a teleport as "something broke", which is the exact opposite of the
// reward this page is built to give.
//
// So: a FLIP. After every commit we know where each card ended up; comparing
// that with where it was BEFORE the commit gives the delta to play back.
//
//   1. a layout effect measures every card's new position, every commit;
//   2. when a card actually changed band, every card that moved as a result
//      gets an instant inverse translate, so it is painted where it was;
//   3. one frame later the translate is released and they all slide home.
//
// WHY offsetTop AND NOT getBoundingClientRect
// `.main` is the scroll container, so a viewport rect changes whenever the user
// scrolls — with no layout change at all. Diffing rects across two commits
// would then invent a delta out of a scroll and animate a card that never
// moved. `offsetTop` is measured against the offset parent, so it is immune to
// scrolling; it is also unaffected by `transform`, so a re-measure taken while
// a slide is still playing is still the truth. And it needs no zoom correction:
// offsetTop and the transform written back are both in the zoomed subtree's own
// coordinate space, so FLUID SCALE's factor cancels (unlike list-motion's
// rect-based FLIP, which does have to divide by `currentZoom`).
//
// WHY THE CLEANUP IS AN UNMOUNT-ONLY EFFECT
// The measuring effect has no dependency array — it must run after every
// commit. If it also returned a cleanup, that cleanup would fire on the very
// next render and cancel the pending frame mid-slide, leaving the card pinned
// at its inverted offset forever. Anything that re-renders during those 340ms
// — the undo banner arriving, the autosave chip ticking — would do it. So the
// teardown lives in its own `[]` effect and only runs on unmount.
//
// NO @keyframes: Lightning CSS rejects them inside a CSS module and this
// variant may not add to the shell's global stylesheet, so every animation on
// this page is a transition — driven from here, or from two different
// durations on two states (see `.landed` in the stylesheet).

import { useEffect, useLayoutEffect, useRef } from "react";
import { reducedMotion } from "./worklist-math";

/** Motion System "Balanced" — the primary ease-out, UI band. */
const EASE = "cubic-bezier(0.22, 0.61, 0.36, 1)";
const MOVE_MS = 340;

/** Under a pixel of drift is a rounding artefact, not a move. */
const EPSILON = 0.5;

/**
 * Play the seam crossing.
 *
 * @param containerRef the element wrapping BOTH bands and the seam. Cards are
 *   found by `[data-card]`; the attribute's value is the card id.
 * @param bandKey a string that changes whenever any card changes band. The
 *   effect measures on every commit (eight `offsetTop` reads — one forced
 *   reflow) but only ANIMATES when this key changed. Otherwise typing one
 *   character would make a card that grew by a line slide, which is noise
 *   rather than causality.
 */
export function useBandFlip(
  containerRef: React.RefObject<HTMLElement | null>,
  bandKey: string,
) {
  /** Where every card sat after the previous commit. */
  const positions = useRef<Map<string, number>>(new Map());
  const lastKey = useRef<string | null>(null);
  /** Frames and listeners owned by the slide currently in flight. */
  const inFlight = useRef<{ frames: number[]; off: (() => void)[] }>({
    frames: [],
    off: [],
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-card]"));

    const before = positions.current;
    const after = new Map<string, number>();
    cards.forEach((el) => {
      const id = el.dataset.card;
      if (id) after.set(id, el.offsetTop);
    });
    positions.current = after;

    const keyChanged = lastKey.current !== null && lastKey.current !== bandKey;
    lastKey.current = bandKey;

    // First commit, a commit that moved no card across the seam, or a user who
    // asked the browser to keep still: measure and leave.
    if (!keyChanged || reducedMotion()) return;

    // A second crossing supersedes the one still playing.
    inFlight.current.frames.forEach((f) => window.cancelAnimationFrame(f));
    inFlight.current.off.forEach((fn) => fn());
    inFlight.current = { frames: [], off: [] };

    cards.forEach((el) => {
      const id = el.dataset.card;
      if (!id) return;
      const wasAt = before.get(id);
      const isAt = after.get(id);
      if (wasAt === undefined || isAt === undefined) return;

      const dy = wasAt - isAt;
      if (Math.abs(dy) < EPSILON) return;

      // Invert: paint it where it used to be, with no transition running.
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;

      // Two frames: one for the browser to accept the inverted position, one to
      // start the transition from it. A single rAF can coalesce both style
      // writes into one recalculation and the slide never plays.
      const frame1 = window.requestAnimationFrame(() => {
        const frame2 = window.requestAnimationFrame(() => {
          if (!el.isConnected) return;
          el.style.transition = `transform ${MOVE_MS}ms ${EASE}`;
          el.style.transform = "";
        });
        inFlight.current.frames.push(frame2);
      });
      inFlight.current.frames.push(frame1);

      // Inline styles left behind outrank every stylesheet `:hover` rule, so a
      // card that finished a slide would silently lose its hover lift. Clear
      // them the moment the slide lands. (That bug has shipped in this codebase
      // once already — see the note in list-motion.ts.)
      const landed = (e: TransitionEvent) => {
        if (e.propertyName !== "transform" || e.target !== el) return;
        el.style.transition = "";
        el.style.transform = "";
        el.removeEventListener("transitionend", landed);
      };
      el.addEventListener("transitionend", landed);
      inFlight.current.off.push(() => el.removeEventListener("transitionend", landed));
    });
  });

  // Unmount only. See the header note — a per-render cleanup would cancel the
  // slide it just started.
  useEffect(() => {
    const held = inFlight;
    return () => {
      held.current.frames.forEach((f) => window.cancelAnimationFrame(f));
      held.current.off.forEach((fn) => fn());
      held.current = { frames: [], off: [] };
    };
  }, []);
}
