"use client";

// STEPS — the accordion engine (route: /dashboard/manual-steps).
//
// THE BET: least ink wins. Exactly one of the ten sections is open; the other
// nine are 72px rows. That buys a whole-form overview no other variant can
// have, and it charges one specific price, which this file exists to pay:
//
//   OPENING A CARD MOVES EVERY CARD BELOW THE ONE THAT JUST SHUT.
//
// Click step 08 while step 03 is open and ~600px of card body vanishes from
// above the pointer. Uncompensated, the row you aimed at is 600px higher than
// your finger by the time the click resolves — you open the wrong section, or
// you lose the page entirely. So:
//
// 1. ANCHORING. The target's viewport top is measured BEFORE React is told
//    anything (afterwards the old geometry is gone), and the scroll container
//    is nudged by the delta in a LAYOUT effect — same frame as the commit, so
//    the jump is never painted. FLUID SCALE puts `zoom` on the shell root, so
//    `getBoundingClientRect()` returns zoomed pixels while `scrollTop` is
//    written unzoomed; every delta is divided by the live zoom. That correction
//    is imported from the shell rather than re-derived.
//
// 2. A CHROME CLAMP. Anchoring is only correct when the target was already in a
//    sensible place. Hold-in-place would happily leave a freshly opened card's
//    heading tucked under the sticky total bar, so after the delta is applied
//    the heading is checked against the bar's real measured bottom and pushed
//    clear if it is behind it. Measured, not a constant: the bar is sticky and
//    the topbar height is a token.
//
// 3. AN "ADVANCE" ALIGNMENT. The foot of every open card carries a Next
//    control, and Next is the one case where holding position is WRONG — the
//    row being opened sits directly under that button, i.e. at the bottom of
//    the viewport, and would expand off-screen. `open(id, "top")` scrolls the
//    new heading to just under the chrome instead, smoothly unless the user
//    has asked the browser to keep still.
//
// 4. FOCUS TRANSFER. A shut section IS a button; opening it unmounts that
//    button and focus would fall to <body> — a WCAG 2.2 failure, not polish.
//    Focus moves to the new card's heading (tabIndex -1, `data-step-focus`),
//    with preventScroll, which the browser would otherwise use to undo 1–3.
//
// Elements are found by attribute rather than through a ref map on purpose: a
// section changes DOM NODE when it opens (button -> section), and a map keyed
// by id has to survive a detach and an attach of two different nodes in one
// commit. A querySelector after the commit cannot get that ordering wrong.
//
// NOT HERE, DELIBERATELY: any Escape handling. Escape must not be trapped by
// this page — the shell owns it (command palette), there is no state to unwind
// (one card is always open), and swallowing it is how an accordion becomes a
// keyboard dead end.

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { currentZoom } from "@/components/v3/blueprint-shell/list-motion";
import { reducedMotion } from "../manual-focus/manual-focus-math";

/** Marks the element that represents a section in either state. */
export const STEP_ATTR = "data-step-id";
/** Marks the heading inside an open card that receives focus. */
export const STEP_FOCUS_ATTR = "data-step-focus";

/** Air between the sticky chrome and a heading pushed clear of it. */
const CHROME_GAP = 16;

/** "hold" keeps the clicked row exactly where the pointer left it. "top" brings
 *  the heading up under the chrome — used only by the Next control. */
export type OpenAlign = "hold" | "top";

export type StepsColumn = {
  openId: string;
  open: (id: string, align?: OpenAlign) => void;
};

export function useStepsColumn(
  initialId: string,
  refs: { stackRef: RefObject<HTMLElement | null>; barRef: RefObject<HTMLElement | null> },
): StepsColumn {
  const { stackRef, barRef } = refs;

  const [openId, setOpenId] = useState(initialId);

  /** Mirror of `openId` readable synchronously inside `open`, so the callback
   *  keeps a stable identity and the ten rows are not re-rendered through it. */
  const openRef = useRef(initialId);

  /** Measurement taken in `open`, consumed once by the layout effect. */
  const pending = useRef<{ id: string; top: number; align: OpenAlign } | null>(null);

  const find = useCallback(
    (id: string) => stackRef.current?.querySelector<HTMLElement>(`[${STEP_ATTR}="${id}"]`) ?? null,
    [stackRef],
  );

  const open = useCallback(
    (id: string, align: OpenAlign = "hold") => {
      if (openRef.current === id) return;
      const el = find(id);
      pending.current = { id, top: el ? el.getBoundingClientRect().top : Number.NaN, align };
      openRef.current = id;
      setOpenId(id);
    },
    [find],
  );

  useLayoutEffect(() => {
    const job = pending.current;
    pending.current = null;
    if (!job) return;

    const el = find(job.id);
    const main = el?.closest<HTMLElement>(".main");
    if (!el || !main) return;

    const zoom = currentZoom(el);
    const floor = (barRef.current?.getBoundingClientRect().bottom ?? 0) + CHROME_GAP * zoom;

    if (job.align === "top") {
      // Advance: put the heading under the chrome rather than where it was.
      const target = main.scrollTop + (el.getBoundingClientRect().top - floor) / zoom;
      main.scrollTo({
        top: Math.max(0, target),
        behavior: reducedMotion() ? "auto" : "smooth",
      });
    } else {
      if (Number.isFinite(job.top)) {
        const delta = el.getBoundingClientRect().top - job.top;
        if (delta !== 0) main.scrollTop += delta / zoom;
      }
      // Held in place, but never behind the bar.
      const behind = el.getBoundingClientRect().top - floor;
      if (behind < 0) main.scrollTop += behind / zoom;
    }

    el.querySelector<HTMLElement>(`[${STEP_FOCUS_ATTR}]`)?.focus({ preventScroll: true });
  }, [openId, find, barRef]);

  return { openId, open };
}
