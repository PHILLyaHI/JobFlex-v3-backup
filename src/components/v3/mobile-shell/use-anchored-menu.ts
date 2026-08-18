"use client";

// ANCHORED DROPDOWN PLACEMENT for the handheld fleet.
//
// WHY THIS EXISTS (2026-08-15). Every (mobile) page draws its filter as a `.dd`
// — a `position: relative` wrapper holding a full-width button and a
// `position: absolute; top: 100%` menu. That geometry has one failure mode and
// the leads sheet hit it head on: when the list under the bar is EMPTY the page
// is barely taller than the viewport, so there is nothing to scroll, and an
// open menu hangs off the bottom edge with no way to reach it. An absolutely
// positioned box does not lengthen the `.scroll` container it overflows, so the
// menu was not merely below the fold — it was unreachable.
//
// THE RULE, and it is the same one native pickers use:
//  · a menu opens DOWNWARD while there is room for it below the trigger;
//  · when there is not, and there is more room above, it FLIPS UP;
//  · either way it is capped at the space actually available and scrolls
//    internally, so a menu taller than the phone is still fully usable.
// Nothing here ever positions the menu outside the visual viewport.
//
// WHY THE DOM IS MUTATED DIRECTLY, like use-sheet-drag: this hook is called
// inside 700+ line page components, and the measurement re-runs on scroll and
// on every visual-viewport change (the software keyboard). Writing one
// attribute and one custom property on the wrapper costs zero React renders.
//
// ── HOW TO ADOPT IT ON ANOTHER PAGE ─────────────────────────────────────────
// 1. TSX — hand the hook the open flag and spread its two prop bags:
//
//      const filterMenu = useAnchoredMenu(filterOpen);
//      <div className={`${styles.dd} ${filterOpen ? styles.open : ""}`}
//           {...filterMenu.anchorProps}>
//        <button className={styles.ddBtn} …>…</button>
//        <div className={styles.ddMenu} role="listbox" {...filterMenu.menuProps}>…</div>
//      </div>
//
//    The outside-pointerdown closer the page already has switches to the hook's
//    own hit test — it is the same node, and `contains` keeps the ref out of
//    render (which react-hooks/refs rejects):
//
//      if (!filterMenu.contains(e.target as Node)) setFilterOpen(false);
//
// 2. CSS — three additions to the module's existing `.ddMenu` block:
//
//      .ddMenu { max-height: var(--menu-max-h, none); overflow-x: hidden; overflow-y: auto; }
//      .dd[data-place="up"] .ddMenu { top: auto; bottom: calc(100% + 6px); transform: translateY(6px); }
//      .dd[data-place="up"].open .ddMenu { transform: none; }
//
//    (Keep the module's own gap value in place of 6px if it differs, and pass
//    the same number as `gap` so the measurement and the paint agree.)
//
// Pages still on the plain downward menu are unaffected — without the hook the
// attribute is never written and `--menu-max-h` falls back to `none`.

import { useCallback, useEffect, useRef } from "react";

export type AnchoredMenuOptions = {
  /** Distance between the trigger and the menu — the CSS `calc(100% + N)`. */
  gap?: number;
  /** Breathing room kept against the viewport edge. */
  margin?: number;
  /**
   * Below this many px of room underneath, opening downward is not worth it
   * even if the menu would technically fit in a scroller that short. Two rows
   * of a 62px cell plus the frame.
   */
  minDown?: number;
};

export type AnchoredMenu = {
  /** Spread on the `position: relative` wrapper holding the trigger AND menu. */
  anchorProps: { ref: (node: HTMLDivElement | null) => void };
  /** Spread on the menu itself — it is read for its natural height. */
  menuProps: { ref: (node: HTMLDivElement | null) => void };
  /**
   * Is `node` inside the anchor? The outside-click closer's hit test, kept here
   * so the page never touches a ref during render.
   */
  contains: (node: Node | null) => boolean;
  /** Re-measure by hand after something changes the menu's own height. */
  measure: () => void;
};

export function useAnchoredMenu(
  open: boolean,
  { gap = 6, margin = 12, minDown = 140 }: AnchoredMenuOptions = {},
): AnchoredMenu {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    // visualViewport, not innerHeight: with the software keyboard up the two
    // disagree by ~300px, and the keyboard is exactly when a filter gets opened
    // right after typing in the search box.
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewH = vv?.height ?? window.innerHeight;

    const below = viewTop + viewH - rect.bottom - gap - margin;
    const above = rect.top - viewTop - gap - margin;

    // The natural height decides whether a flip is warranted at all: a short
    // menu that fits below must never jump above just because there is more
    // room up there. `.ddMenu` is hidden with visibility/opacity, not display,
    // so it is laid out and measurable while closed; a menu that was given no
    // ref falls back to the two-row floor.
    const wanted = menuRef.current?.scrollHeight || minDown;

    // Down while it fits; otherwise whichever side has more room. The tie goes
    // downward, so a page with nothing above or below the trigger behaves the
    // way it always did.
    const place = below >= wanted || below >= above ? "down" : "up";
    // Floored, not just capped: on a short landscape viewport both sides can be
    // near zero, and a two-row scrolling menu still beats a 20px sliver.
    const room = Math.max(minDown, Math.round(place === "down" ? below : above));

    anchor.dataset.place = place;
    anchor.style.setProperty("--menu-max-h", `${room}px`);
  }, [gap, margin, minDown]);

  useEffect(() => {
    if (!open) return;
    measure();
    const vv = window.visualViewport;
    // `capture: true` — the page scroller is an inner element, so a bubbling
    // document listener would never see its scroll event.
    document.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      document.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
  }, [open, measure]);

  // Callback refs inside prop bags, the shape use-sheet-drag already ships:
  // a plain RefObject handed back to JSX trips react-hooks/refs.
  const setAnchor = useCallback((node: HTMLDivElement | null) => {
    anchorRef.current = node;
  }, []);
  const setMenu = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
  }, []);
  const contains = useCallback(
    (node: Node | null) => !!node && !!anchorRef.current?.contains(node),
    [],
  );

  return {
    anchorProps: { ref: setAnchor },
    menuProps: { ref: setMenu },
    contains,
    measure,
  };
}
