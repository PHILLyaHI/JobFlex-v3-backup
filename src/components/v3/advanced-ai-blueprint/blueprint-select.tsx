"use client";

// A select the blueprint can actually draw.
//
// WHY IT EXISTS
//
// The intake card styled the CLOSED state of a native <select> — `appearance:
// none`, a drawn ink chevron, mono type — and then the OS drew the open list in
// its own chrome: system font, system blue highlight, system radii, sitting on
// a page whose whole argument is that it looks like a technical drawing. There
// is no CSS that reaches inside a native option list, so the control had to
// stop being one.
//
// The 51-row State list is also the wrong shape for a native menu on a laptop:
// it opens as a long OS scroller with no type-ahead feedback of its own. This
// one keeps the WAI-ARIA combobox contract — arrows, Home/End, Enter, Escape,
// printable-character type-ahead, outside click — and draws every part of it.
//
// ── WHY THE LIST IS PORTALLED ──────────────────────────────────────
// `.est-console` is `overflow: hidden` (the donor's, so the masthead's ink rule
// meets the card edge), which clips any absolutely-positioned child. The list is
// therefore `position: fixed` and portalled — but into the page's `.content`
// element, NOT <body>: every rule in ./advanced-ai.module.css is scoped
// `:global(.jf-blueprint .content) .cls`, so a list mounted outside `.content`
// would render completely unstyled. `.content` has no transformed ancestor
// (verified against blueprint-shell/shell-behavior.ts, whose parallax moves a
// background-position, not a transform), so viewport coordinates hold.

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import defaultStyles from "./advanced-ai.module.css";

export type SelectOption = { value: string; label: string };

/** A CSS-module map carrying the `bsel*` rules. */
export type SelectStyles = Record<string, string>;

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** Shown when `value` is "" — styled as a placeholder, not as a value. */
  placeholder: string;
  ariaLabel: string;
  id?: string;
  /** Extra module class for the trigger (e.g. the ledger's compact unit cell). */
  triggerClass?: string;
  disabled?: boolean;
  /**
   * The CSS module that draws it. Defaults to the Smart Proposal's; another
   * page (the manual builder's line items, the video estimator's ledger)
   * passes its own module carrying the same `bsel`, `bsel-btn`, `bsel-val`,
   * `bsel-caret`, `bsel-list`, `bsel-opt` rules, so the one control is drawn
   * by whichever stylesheet owns the page it sits on.
   */
  styles?: SelectStyles;
};

export function BlueprintSelect({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  id,
  triggerClass,
  disabled,
  styles,
}: Props) {
  const s: SelectStyles = styles ?? (defaultStyles as SelectStyles);
  const cx = (...names: Array<string | false | null | undefined>): string =>
    names
      .filter(Boolean)
      .map((n) => s[n as string] ?? (n as string))
      .join(" ");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [host, setHost] = useState<HTMLElement | null>(null);
  // All four are in the shell's ZOOMED coordinate space — see `measure`.
  const [box, setBox] = useState({ top: 0, left: 0, width: 0, vh: 0, up: false });
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Type-ahead buffer: printable keys within 700ms compose one query.
  const typed = useRef<{ q: string; at: number }>({ q: "", at: 0 });
  const listId = useId();

  const selectedIdx = options.findIndex((o) => o.value === value);
  const label = selectedIdx >= 0 ? options[selectedIdx].label : placeholder;

  useEffect(() => {
    setHost(btnRef.current?.closest<HTMLElement>(".content") ?? document.body);
  }, []);

  const measure = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // FLUID SCALE, and it is load-bearing. blueprint-shell/shell-behavior.ts
    // sets `zoom: innerWidth/1728` on the shell root, so getBoundingClientRect
    // returns VISUAL pixels while a position:fixed child inside that root is
    // laid out in the zoomed coordinate space. Placing the list at the raw rect
    // put it ~100px left of its own field at 1600px wide. DESIGN.md states the
    // rule: JS geometry of fixed elements divides window coordinates by zoom.
    const shell = el.closest<HTMLElement>(".jf-blueprint");
    const z = (shell && parseFloat(getComputedStyle(shell).zoom)) || 1;
    const vh = window.innerHeight / z;
    const top = r.top / z;
    const bottom = r.bottom / z;
    // 51 states will not fit under a field near the fold; flip up when the room
    // below is worse than the room above.
    const wanted = Math.min(260, options.length * 32 + 12);
    const up = vh - bottom < wanted && top > vh - bottom;
    setBox({ top: up ? top - 5 : bottom + 5, left: r.left / z, width: r.width / z, vh, up });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const onReflow = () => measure();
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, measure]);

  // Outside click. mousedown so a click that lands on the trigger's own toggle
  // is not processed twice.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Keep the active option in view as the arrows walk a 51-row list.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  function commit(i: number) {
    const opt = options[i];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
    btnRef.current?.focus();
  }

  function openWith(i: number) {
    setActive(i);
    setOpen(true);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    const last = options.length - 1;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openWith(selectedIdx >= 0 ? selectedIdx : 0);
      const next =
        e.key === "ArrowDown" ? Math.min(active + 1, last) : Math.max(active - 1, 0);
      setActive(next < 0 ? 0 : next);
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      if (!open) return;
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : last);
      return;
    }
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      if (!open) return openWith(selectedIdx >= 0 ? selectedIdx : 0);
      commit(active >= 0 ? active : selectedIdx);
      return;
    }
    if (e.key === "Escape") {
      if (!open) return;
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    // Type-ahead: "ne" walks Nebraska → Nevada → New Hampshire.
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const now = Date.now();
      const q = (now - typed.current.at < 700 ? typed.current.q : "") + e.key.toLowerCase();
      typed.current = { q, at: now };
      const from = open ? active : selectedIdx;
      // Search after the cursor first so repeating one letter cycles matches.
      const order = [
        ...options.slice(from + 1),
        ...options.slice(0, Math.max(from + 1, 0)),
      ];
      const hit = order.find((o) => o.label.toLowerCase().startsWith(q));
      if (!hit) return;
      e.preventDefault();
      const i = options.indexOf(hit);
      if (open) setActive(i);
      else onChange(hit.value);
    }
  }

  return (
    <span className={cx("bsel")}>
      <button
        ref={btnRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        data-empty={value ? undefined : "1"}
        data-open={open ? "1" : undefined}
        className={cx("bsel-btn", triggerClass)}
        onKeyDown={onKeyDown}
        onClick={() => (open ? setOpen(false) : openWith(selectedIdx >= 0 ? selectedIdx : 0))}
      >
        <span className={cx("bsel-val")}>{label}</span>
        <span className={cx("bsel-caret")} aria-hidden="true" />
      </button>

      {open &&
        host &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className={cx("bsel-list")}
            // As wide as the trigger, and WIDER when an option needs it —
            // "linear ft" and "sq boards" were ellipsised inside a 80px unit
            // column. The list is a popup, not a cell; it may overhang.
            style={{
              top: box.up ? undefined : box.top,
              bottom: box.up ? box.vh - box.top : undefined,
              left: box.left,
              minWidth: box.width,
              width: "max-content",
              maxWidth: 260,
            }}
          >
            {options.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                data-on={i === active ? "1" : undefined}
                data-picked={o.value === value ? "1" : undefined}
                className={cx("bsel-opt")}
                // mousedown, not click: the document listener above would
                // otherwise close the list before the click resolved.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(i);
                }}
                onMouseEnter={() => setActive(i)}
              >
                {o.label}
              </li>
            ))}
          </ul>,
          host,
        )}
    </span>
  );
}
