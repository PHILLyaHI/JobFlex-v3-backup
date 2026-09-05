"use client";

// The page's own drawn select — a listbox the page paints, not the OS's menu.
//
// WHY NOT `bp-sel`. The shell's `.bp-sel` wraps a real `<select>`; its open
// menu is drawn by the OS everywhere except the newest Chromium and Safari
// (`appearance: base-select`). The owner asked for a styled dropdown WITH
// SEARCH (2026-09-03), and neither is reachable through a native select — a
// `<select>` has no filter field and no way to style its popup portably.
//
// So: a button that owns `aria-haspopup="listbox"`, and a panel of options in
// the page's own ink-frame language. `searchable` adds the filter field; the
// unit picker uses the same component without it, so both dropdowns on the
// Work side are one implementation and cannot drift.
//
// Correctness this owes the ARIA combobox pattern and actually implements:
// roving `aria-activedescendant`, Up/Down/Home/End/Enter/Escape, type-ahead
// through the filter, outside-click and focus-out close, focus returned to the
// trigger on close, and `aria-selected` on exactly the chosen row.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type HireSelectProps = {
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  /** Shown on the trigger when `value` is empty. */
  placeholder: string;
  /** Adds the filter field. Off for short, memorable lists. */
  searchable?: boolean;
  /** Placeholder for the filter field. */
  searchPlaceholder?: string;
  /** A first row that clears the value — the filter bar's "All trades". */
  clearLabel?: string;
  /** Display text per option, where the stored value is not what to show —
   *  the rate unit stores "hour" and reads "per hour". */
  labels?: Record<string, string>;
  ariaLabel: string;
  /** Extra class on the wrapper, for width. */
  className?: string;
  disabled?: boolean;
};

export function HireSelect({
  value,
  onChange,
  options,
  placeholder,
  searchable = false,
  searchPlaceholder = "Type to filter",
  clearLabel,
  labels,
  ariaLabel,
  className,
  disabled,
}: HireSelectProps) {
  const text = (row: string) => labels?.[row] ?? row;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  /** `clearLabel` rides as an empty-string row so the keyboard walks it too. */
  const rows = useMemo(() => {
    const base = clearLabel ? ["", ...options] : [...options];
    const n = q.trim().toLowerCase();
    if (!n) return base;
    return base.filter((o) =>
      o === "" ? false : (labels?.[o] ?? o).toLowerCase().includes(n),
    );
  }, [options, clearLabel, q, labels]);

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false);
      setQ("");
      if (refocus) btnRef.current?.focus();
    },
    [],
  );

  // Filtering can shorten the list out from under the highlight, so the index
  // in play is CLAMPED at render rather than corrected by an effect — an
  // effect would render one frame pointing at a row that is not there.
  const activeIdx = rows.length ? Math.min(active, rows.length - 1) : 0;

  /** Opening lands the highlight on what is already chosen, so Enter is a
   *  no-op rather than a silent change to whatever happened to be first. */
  const openNow = () => {
    const i = rows.findIndex((o) => o === value);
    setActive(i >= 0 ? i : 0);
    setOpen(true);
  };

  // Move focus into the panel once it exists. The filter field is the point of
  // a searchable list, so it takes focus; an unsearchable one focuses the list
  // itself and reads arrow keys there.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      if (searchable) searchRef.current?.focus();
      else listRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, searchable]);

  // Outside click closes without stealing focus back — the user is already
  // somewhere else on purpose.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);

  // Keep the highlighted row in view by scrolling THE LIST ONLY.
  //
  // This was `scrollIntoView({ block: "nearest" })`, which scrolls every
  // scrollable ancestor — and the composer card is one. Opening the rate-unit
  // picker therefore scrolled the whole card sideways to reveal a panel that
  // overflowed its column, and the form visibly jumped left with its labels
  // clipped. Setting `scrollTop` on the list cannot move anything but the list.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[data-active="1"]');
    if (!list || !row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight;
    }
  }, [open, activeIdx]);

  const commit = useCallback(
    (row: string) => {
      onChange(row);
      close(true);
    },
    [onChange, close],
  );

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      setActive((a) => {
        const at = rows.length ? Math.min(a, rows.length - 1) : 0;
        return (at + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length;
      });
      return;
    }
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : rows.length - 1);
      return;
    }
    if (e.key === "Enter" || (e.key === "Tab" && open)) {
      if (e.key === "Enter") e.preventDefault();
      const row = rows[activeIdx];
      if (row !== undefined) commit(row);
    }
  };

  const label = value ? text(value) : placeholder;

  return (
    <div className={"hm-sel" + (className ? ` ${className}` : "")} ref={rootRef}>
      <button
        ref={btnRef}
        type="button"
        className="hm-sel-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-empty={value ? undefined : "1"}
        disabled={disabled}
        onClick={() => (open ? close(false) : openNow())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openNow();
          }
        }}
      >
        <span className="hm-sel-val">{label}</span>
        <span className="hm-sel-caret" aria-hidden="true" />
      </button>

      {open && (
        <div className="hm-sel-pop">
          {searchable && (
            <input
              ref={searchRef}
              className="hm-sel-q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              aria-label={`${ariaLabel} — filter`}
              aria-controls={listId}
              aria-activedescendant={rows.length ? `${listId}-${activeIdx}` : undefined}
              autoComplete="off"
            />
          )}
          <div
            id={listId}
            ref={listRef}
            className="hm-sel-list"
            role="listbox"
            aria-label={ariaLabel}
            tabIndex={searchable ? -1 : 0}
            aria-activedescendant={rows.length ? `${listId}-${activeIdx}` : undefined}
            onKeyDown={searchable ? undefined : onKey}
          >
            {rows.length ? (
              rows.map((row, i) => (
                <div
                  key={row || "__clear"}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={row === value}
                  data-active={i === activeIdx ? "1" : undefined}
                  className={
                    "hm-sel-opt" +
                    (row === value ? " is-on" : "") +
                    (i === activeIdx ? " is-active" : "") +
                    (row === "" ? " is-clear" : "")
                  }
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  // Picked with a pointer, so the panel just closes — pulling
                  // focus back to the trigger is a keyboard courtesy, and
                  // doing it here would yank focus after a mouse click.
                  onClick={() => {
                    onChange(row);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  {row ? text(row) : clearLabel}
                </div>
              ))
            ) : (
              <div className="hm-sel-none">No trade matches “{q.trim()}”</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
