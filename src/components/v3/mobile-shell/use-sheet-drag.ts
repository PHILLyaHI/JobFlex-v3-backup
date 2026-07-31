"use client";

// SWIPE-DOWN-TO-DISMISS for every handheld bottom sheet.
//
// WHY THIS EXISTS (2026-07-30). Every sheet in the (mobile) fleet drew a grab
// handle and then did nothing with it — the bar was decoration, and the only
// ways out were the scrim, the Cancel foot and Escape. On a phone the pull-down
// is the gesture people try first, so the handle was actively lying. This hook
// is the one implementation all of them opt into; nothing here is per-page, so
// a sheet is wired by spreading two prop bags.
//
// WHY A HOOK AND NOT A <Sheet> COMPONENT. The sheets are not one component.
// Each page owns its own CSS module with its own `.sheet` geometry (some are
// 92% tall forms, some are five menu rows), and several pages render two or
// three sheets against one shared scrim. Wrapping them would have meant a
// rewrite of twenty-three surfaces to buy nothing the drag needs. The drag only
// needs the root element and a way to say "closed" — so that is the whole API.
//
// WHY THE DOM IS MUTATED DIRECTLY. The obvious build keeps the offset in state,
// but the hook is called inside page components that render 700+ lines of JSX,
// so a setState per pointermove would re-render the whole page sixty times a
// second while a finger is down. Writing `transform` on the ref keeps the drag
// on the compositor and costs zero React renders; the only React work in a
// gesture is the caller's own `onDismiss`.
//
// WHY IT DOES NOT FIGHT THE SCROLLABLE BODY. A sheet body that scrolls and a
// sheet that drags are the same downward finger, and guessing wrong makes the
// sheet feel broken in both directions. The rule:
//  · a pull that STARTS on the grab handle or the header always drags — those
//    elements carry `touch-action: none`, so the browser hands us the gesture;
//  · a pull that starts anywhere else only drags if the nearest scrollable
//    ancestor is already at its top, and only downward. Scrolling up, or a
//    gesture that turns out to be horizontal (the chip rails), is handed back.
//
// Reduced motion is honoured at release: no spring, no travel — the sheet snaps
// to where it is going.

import { useCallback, useEffect, useRef } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/** Pull that dismisses, as a share of the sheet's own height. */
const DISMISS_RATIO = 0.28;
/** …capped, so a 92%-tall form sheet is not a marathon to close. */
const DISMISS_MAX = 110;
/** Downward px/ms that dismisses regardless of distance — the flick. */
const DISMISS_VELOCITY = 0.55;
/** Travel before the gesture is taken away from the sheet body. */
const SLOP = 8;
/** A flick still has to have gone somewhere, or a tap with jitter closes. */
const FLICK_MIN = 24;
/** The stylesheet gives a sheet 0.3s of travel; clean up a frame after that. */
const SETTLE_MS = 380;

type Gesture = {
  id: number;
  startX: number;
  startY: number;
  lastY: number;
  lastT: number;
  /** px/ms, signed — positive is downward. */
  velocity: number;
  /** Started on the handle or header, so the scroll position is irrelevant. */
  fromHandle: boolean;
  scroller: HTMLElement | null;
  /** True once the gesture has been claimed and the sheet is following. */
  active: boolean;
};

/** Nearest scrolling ancestor of `from` inside `root`, or null if the pull
 *  started over static content (a menu list that fits, a header block). */
function scrollerFor(from: Element | null, root: HTMLElement): HTMLElement | null {
  let node: Element | null = from;
  while (node && node !== root) {
    if (node instanceof HTMLElement) {
      const overflowY = getComputedStyle(node).overflowY;
      if (
        (overflowY === "auto" || overflowY === "scroll") &&
        node.scrollHeight > node.clientHeight + 1
      ) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

/** Hand the sheet's transform back to the stylesheet. */
function clearInline(el: HTMLElement) {
  el.style.transform = "";
  el.style.transition = "";
  el.style.willChange = "";
}

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export type SheetDrag = {
  /** Spread on the sheet root — the element the `.sheet` transform lives on. */
  sheetProps: {
    ref: (node: HTMLDivElement | null) => void;
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onClickCapture: (e: ReactMouseEvent<HTMLDivElement>) => void;
  };
  /** Spread on the grab handle AND the header — together they are the ≥44px
   *  drag strip, and the 3px bar finally means something. */
  handleProps: {
    "data-sheet-handle": string;
    style: CSSProperties;
  };
};

/**
 * @param open      whether the sheet is currently shown — the hook ignores
 *                  pointers while closed and resets its inline styles on open.
 * @param onDismiss the sheet's existing close path (the same callback Cancel
 *                  and the scrim already use), so nothing new has to be undone.
 */
export function useSheetDrag(open: boolean, onDismiss: () => void): SheetDrag {
  const elRef = useRef<HTMLDivElement | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const settle = useRef<number | null>(null);
  /** A drag that ends over a menu row must not also fire that row's click. */
  const dragged = useRef(false);
  /** Kept in a ref so the handlers never need to be re-created — callers pass
   *  an inline arrow, and a new identity per render would otherwise rebuild
   *  every listener on a page that re-renders on each keystroke. Written in an
   *  effect rather than during render: a gesture only ever reads it from a
   *  pointer handler, which is always after the commit. */
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  const setRef = useCallback((node: HTMLDivElement | null) => {
    elRef.current = node;
  }, []);

  const scheduleCleanup = useCallback(() => {
    if (settle.current !== null) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      settle.current = null;
      const el = elRef.current;
      if (el) clearInline(el);
    }, SETTLE_MS);
  }, []);

  // Re-opening always starts from a clean sheet: a dismissed sheet is left
  // parked at translateY(100%) inline until the settle timer fires, and a fast
  // re-open would otherwise show nothing at all.
  useEffect(() => {
    if (!open) return;
    if (settle.current !== null) {
      window.clearTimeout(settle.current);
      settle.current = null;
    }
    const el = elRef.current;
    if (el) clearInline(el);
  }, [open]);

  useEffect(
    () => () => {
      if (settle.current !== null) window.clearTimeout(settle.current);
    },
    [],
  );

  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (!open) return;
    // Right/middle mouse buttons are not a drag.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = elRef.current;
    if (!el) return;

    const target = e.target instanceof Element ? e.target : null;
    const scroller = scrollerFor(target, el);
    // Set here, not in CSS: the body must not rubber-band the page while the
    // sheet is being pulled, or the browser steals the gesture mid-drag and we
    // get a pointercancel instead of a dismiss. pointerdown still lands before
    // the browser resolves the scroll, so this applies to THIS gesture.
    if (scroller) scroller.style.overscrollBehaviorY = "contain";

    gesture.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      fromHandle: !!target?.closest("[data-sheet-handle]"),
      scroller,
      active: false,
    };
  }, [open]);

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    const el = elRef.current;
    if (!g || !el || g.id !== e.pointerId) return;

    const dy = e.clientY - g.startY;
    const dx = e.clientX - g.startX;

    const dt = e.timeStamp - g.lastT;
    if (dt > 0) g.velocity = (e.clientY - g.lastY) / dt;
    g.lastY = e.clientY;
    g.lastT = e.timeStamp;

    if (!g.active) {
      // Upward, or sideways: this was never ours. Dropping the gesture (rather
      // than merely ignoring it) means a pull that reverses back down mid-scroll
      // cannot suddenly snatch the sheet out from under the finger.
      if (dy < -SLOP || Math.abs(dx) > Math.abs(dy) + SLOP) {
        gesture.current = null;
        return;
      }
      if (dy <= SLOP) return;
      if (!g.fromHandle && g.scroller && g.scroller.scrollTop > 0) {
        gesture.current = null;
        return;
      }
      g.active = true;
      // Capture so the sheet keeps following a finger that leaves it — a pull
      // that ends past the bottom edge of the screen is the normal case.
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // Pointer already released; the move handlers simply stop firing.
      }
      el.style.transition = "none";
      el.style.willChange = "transform";
    }

    el.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }, []);

  const finish = useCallback((e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const g = gesture.current;
    const el = elRef.current;
    // Only the pointer that owns the gesture may end it: a second finger
    // landing and lifting mid-pull must not drop the drag on the floor.
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!el || !g.active) return;

    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      // Already released — nothing to undo.
    }
    // The finger travelled: swallow the click this gesture would otherwise
    // deliver to whatever row it happened to end over.
    dragged.current = true;

    const dy = Math.max(0, e.clientY - g.startY);
    const height = el.getBoundingClientRect().height || 1;
    const far = dy > Math.min(DISMISS_MAX, height * DISMISS_RATIO);
    const flicked = g.velocity > DISMISS_VELOCITY && dy > FLICK_MIN;
    const dismiss = !cancelled && (far || flicked);

    if (reducedMotion()) {
      clearInline(el);
      if (dismiss) dismissRef.current();
      return;
    }

    // Dropping `transition: none` hands travel back to the stylesheet's 0.3s
    // ease-out, which then runs from wherever the finger left the sheet.
    el.style.willChange = "";
    el.style.transition = "";
    el.style.transform = dismiss ? "translateY(100%)" : "translateY(0px)";
    if (dismiss) dismissRef.current();
    // The inline transform has to outlive the class change, or the sheet would
    // snap home for a frame before the close animation started.
    scheduleCleanup();
  }, [scheduleCleanup]);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => finish(e, false),
    [finish],
  );
  const onPointerCancel = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => finish(e, true),
    [finish],
  );

  const onClickCapture = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragged.current) return;
    dragged.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  return {
    sheetProps: {
      ref: setRef,
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onClickCapture,
    },
    handleProps: {
      "data-sheet-handle": "",
      // Behaviour, not theme: the browser must not pan while a pull that began
      // on the handle is in flight. `grab` gives the same affordance a mouse.
      style: { touchAction: "none", cursor: "grab" },
    },
  };
}
