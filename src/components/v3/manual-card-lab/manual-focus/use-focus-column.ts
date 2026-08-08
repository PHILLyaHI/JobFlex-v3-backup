"use client";

// FOCUS CARD — the engine behind the thesis (route: /dashboard/manual-focus).
//
// THE BET, RESTATED IN CODE
// Ten cards stack down one column. Exactly one is LIVE — full ink, controls
// open. The other nine stand down to a quiet summary face that still prints
// their real content. Promotion is a change of WEIGHT, and the promise attached
// to that word is a physical one: THE COLUMN MUST NOT JUMP UNDER THE CURSOR.
//
// Two things are needed to keep that promise, and neither is CSS.
//
// 1. SCROLL ANCHORING. Promoting card 08 closes card 03 above it, which pulls
//    everything below card 03 upward by however tall card 03's body was — often
//    several hundred pixels. Without compensation the card you clicked slides
//    out from under the pointer before the click has even finished. So the
//    promoted card's viewport position is measured BEFORE the state change and
//    restored in a layout effect AFTER it, by adjusting the scroll container.
//    A layout effect, not an effect: this has to land in the same frame as the
//    commit, or the jump is painted once and then corrected, which is worse
//    than not correcting it.
//
//    FLUID SCALE puts `zoom` on the shell root, so `getBoundingClientRect()`
//    reports ZOOMED pixels while `scrollTop` is written in the element's own
//    unzoomed space. Every measured delta is divided by the live zoom. That
//    correction is imported rather than re-derived — `currentZoom` is published
//    by the shell precisely because this trap is not specific to FLIP.
//
// 2. FOCUS TRANSFER. A stood-down card IS a button; promoting it unmounts that
//    button, and focus would fall to <body> — which loses the keyboard user's
//    place entirely and is a WCAG 2.2 failure, not a polish issue. So every
//    promotion moves focus to the newly live card's heading (a `tabIndex={-1}`
//    element carrying `data-focus-anchor`). Tab from there walks into the
//    card's own controls, which is where the user was going anyway.
//    `preventScroll: true` is mandatory: the browser's default scroll-into-view
//    on focus would undo the anchoring above.
//
// Nothing here animates a height. Weight, colour, border and shadow are what
// transition; the face swap itself is instantaneous, because a 200ms collapse
// that drags 400px of column past the pointer is exactly the jump this hook
// exists to prevent.

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { currentZoom } from "@/components/v3/blueprint-shell/list-motion";

/** Put this on the element that should receive focus when a card goes live —
 *  the card's own heading. One attribute rather than a second ref map. */
export const FOCUS_ANCHOR_ATTR = "data-mc-focus";

export type FocusColumn = {
  /** The id of the one card that is currently live. */
  liveId: string;
  /** Promote a card. Idempotent — promoting the live card is a no-op, which is
   *  what lets the same handler serve both `onClick` and `onFocus`. */
  promote: (id: string) => void;
  /** Ref callback every card section passes as its `ref`. */
  register: (id: string, el: HTMLElement | null) => void;
};

export function useFocusColumn(initialId: string): FocusColumn {
  const [liveId, setLiveId] = useState(initialId);

  /** Mirror of `liveId` readable synchronously inside `promote`. Reading state
   *  there instead would make `promote` change identity on every promotion and
   *  re-render all ten cards through their memoised handlers. */
  const liveRef = useRef(initialId);

  /** id -> section element. A Map, not an array: cards are addressed by id and
   *  the map survives any future reordering of the column. */
  const cards = useRef(new Map<string, HTMLElement | null>());

  /** The measurement taken just before a promotion, consumed by the layout
   *  effect below and then cleared. */
  const anchor = useRef<{ id: string; top: number } | null>(null);
  const focusTarget = useRef<string | null>(null);

  const register = useCallback((id: string, el: HTMLElement | null) => {
    if (el) cards.current.set(id, el);
    else cards.current.delete(id);
  }, []);

  const promote = useCallback((id: string) => {
    if (liveRef.current === id) return;
    const el = cards.current.get(id);
    // Measure BEFORE React is told anything. Once the state is set the DOM is
    // already the new one and the old position is unrecoverable.
    if (el) anchor.current = { id, top: el.getBoundingClientRect().top };
    focusTarget.current = id;
    liveRef.current = id;
    setLiveId(id);
  }, []);

  useLayoutEffect(() => {
    const pending = anchor.current;
    anchor.current = null;

    if (pending) {
      const el = cards.current.get(pending.id);
      const main = el?.closest<HTMLElement>(".main");
      if (el && main) {
        // How far the card moved as a result of the face swap above it.
        const delta = el.getBoundingClientRect().top - pending.top;
        if (delta !== 0) main.scrollTop += delta / currentZoom(el);
      }
    }

    const target = focusTarget.current;
    focusTarget.current = null;
    if (target) {
      const el = cards.current.get(target);
      el?.querySelector<HTMLElement>(`[${FOCUS_ANCHOR_ATTR}]`)?.focus({ preventScroll: true });
    }
  }, [liveId]);

  return { liveId, promote, register };
}
