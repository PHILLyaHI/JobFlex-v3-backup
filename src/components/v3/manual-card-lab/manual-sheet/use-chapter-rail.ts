"use client";

// CHAPTERS — the sticky rail's brain: which chapter am I in, and jump to one.
//
// Route: /dashboard/manual-sheet.
//
// WHY SCROLL MATH AND NOT IntersectionObserver.
// IO answers "is any part of this element in a band", which is the wrong
// question for a five-item rail: chapter 2 here is ~1400px tall and chapter 4 is
// ~700px, so at any moment two or three of them intersect a sensible band at
// once and the tie-break — largest ratio, topmost, first seen — is exactly the
// arbitrary bit. The rail has to answer "which chapter's heading did I last
// scroll past", which is a single comparison against one line: the bottom of the
// sticky chrome. So this reads rects on scroll and picks the LAST chapter whose
// top has crossed that line. Deterministic, no thresholds to tune, and it
// degrades correctly when a chapter is shorter than the viewport.
//
// THE THREE TRAPS THIS FILE EXISTS TO HANDLE
//
// 1. The scroll container is NOT the window. The blueprint shell puts
//    `overflow-y: auto` on `.main`, so `window.scrollY` never moves and a
//    listener on `window` never fires. Everything here reads and writes
//    `.main`, found by walking up from a registered card.
//
// 2. The last chapter can never reach the line. "What they get" is followed by
//    the foot, and if their combined height is less than a viewport the column
//    runs out of scroll before chapter 5's top crosses the threshold — the rail
//    would stick on chapter 4 at the very bottom of the page, which is the one
//    place the user is certain where they are. Two answers, both applied: a
//    `.tail` spacer under the foot, and an explicit at-the-bottom override here.
//
// 3. A click-jump passes through every chapter between here and there. Letting
//    the scroll handler run during a smooth scroll strobes the marker across the
//    whole rail. So a jump sets the target immediately and LOCKS the derived
//    update until the container stops moving (two consecutive equal scrollTop
//    readings), rather than for a guessed duration — a fixed timeout is either
//    too short on a long jump or leaves the rail deaf after a short one.

import { useCallback, useEffect, useRef, useState } from "react";
import { reducedMotion } from "../manual-focus/manual-focus-math";
import type { ChapterId } from "./sheet-chapters";

/** Air between the sticky chrome and the chapter head it just revealed. On the
 *  8pt scale like everything else in this variant. */
const CLEARANCE = 24;

type Marker = { x: number; w: number };

export function useChapterRail(ids: readonly ChapterId[]) {
  const cards = useRef(new Map<ChapterId, HTMLElement>());
  const tabs = useRef(new Map<ChapterId, HTMLElement>());
  const railRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const lockRef = useRef(false);

  const [active, setActive] = useState<ChapterId>(ids[0]);
  const [marker, setMarker] = useState<Marker>({ x: 0, w: 0 });

  const setCard = useCallback(
    (id: ChapterId) => (el: HTMLElement | null) => {
      if (el) cards.current.set(id, el);
      else cards.current.delete(id);
    },
    [],
  );

  const setTab = useCallback(
    (id: ChapterId) => (el: HTMLElement | null) => {
      if (el) tabs.current.set(id, el);
      else tabs.current.delete(id);
    },
    [],
  );

  /** The scroll container, and the y-coordinate (in viewport space) of the line
   *  a chapter head has to cross to become current. */
  const geometry = useCallback(() => {
    const first = cards.current.get(ids[0]);
    const scroller = first?.closest<HTMLElement>(".main") ?? null;
    if (!scroller) return null;
    const railH = railRef.current?.offsetHeight ?? 0;
    // The topbar is sticky at the scrollport's own top, so its rendered height
    // is the offset — read it rather than trusting the token, which a narrow
    // viewport could restyle.
    const topbar = scroller.querySelector<HTMLElement>(".topbar");
    const topbarH = topbar?.offsetHeight ?? 0;
    const line = scroller.getBoundingClientRect().top + topbarH + railH + CLEARANCE;
    return { scroller, line };
  }, [ids]);

  /* ── derive the active chapter from the current scroll position ── */
  useEffect(() => {
    const geo = geometry();
    if (!geo) return;
    const { scroller } = geo;

    let frame = 0;

    const measure = () => {
      frame = 0;
      if (lockRef.current) return;
      const g = geometry();
      if (!g) return;

      // Trap 2: at the very bottom, the last chapter is the answer regardless.
      const atBottom =
        g.scroller.scrollTop + g.scroller.clientHeight >= g.scroller.scrollHeight - 2;
      if (atBottom) {
        setActive(ids[ids.length - 1]);
        return;
      }

      let current = ids[0];
      for (const id of ids) {
        const el = cards.current.get(id);
        if (!el) continue;
        // +1 absorbs the sub-pixel rounding a fractional device pixel ratio
        // leaves behind after a programmatic scroll lands exactly on the line.
        if (el.getBoundingClientRect().top <= g.line + 1) current = id;
      }
      setActive(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [geometry, ids]);

  /* ── keep the sliding marker under the active tab ── */
  useEffect(() => {
    const place = () => {
      const el = tabs.current.get(active);
      if (!el) return;
      setMarker({ x: el.offsetLeft, w: el.offsetWidth });
    };
    place();

    const box = tabsRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    // Web-font swap and container resize both move the tabs under the marker.
    const ro = new ResizeObserver(place);
    ro.observe(box);
    return () => ro.disconnect();
  }, [active]);

  /* ── jump ── */
  const jumpTo = useCallback(
    (id: ChapterId) => {
      const geo = geometry();
      const el = cards.current.get(id);
      if (!geo || !el) return;
      const { scroller, line } = geo;

      // `line` already carries the scroller's own offset, the topbar and the
      // rail, so landing the card's top exactly ON it leaves CLEARANCE of air
      // under the sticky chrome and nothing to add here.
      const top = scroller.scrollTop + el.getBoundingClientRect().top - line;

      setActive(id);
      lockRef.current = true;
      scroller.scrollTo({ top, behavior: reducedMotion() ? "auto" : "smooth" });

      // Trap 3: hold the marker until the container has actually stopped, which
      // is two identical readings a frame apart — not a guessed duration.
      let last = Number.NaN;
      let still = 0;
      const settle = () => {
        const now = scroller.scrollTop;
        if (Math.abs(now - last) < 0.5) still += 1;
        else still = 0;
        last = now;
        if (still >= 2) {
          lockRef.current = false;
          return;
        }
        requestAnimationFrame(settle);
      };
      requestAnimationFrame(settle);
    },
    [geometry],
  );

  return { active, marker, jumpTo, setCard, setTab, railRef, tabsRef };
}
