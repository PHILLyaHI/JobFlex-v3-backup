"use client";

// The handheld state field: a drawn face plus a bottom sheet of choices.
//
// WHY THIS IS NOT A <select>
//
// The native control could not satisfy either half of what was asked of it.
//
//  1. CONTRAST. A <select> showing a placeholder has to colour ITSELF muted,
//     and native <option> elements inherit that colour — so every row in the
//     open popup rendered muted-faint until a value was picked, at which point
//     the whole list snapped to ink. That reads as a bug because it is one, and
//     it is not fixable from the select's own colour: the placeholder and the
//     options are the same inheritance chain.
//  2. ROW HEIGHT. On a phone a <select> opens the OS picker. Padding, height
//     and font-size on <option> are ignored outright there, and only partially
//     honoured by desktop Chrome — so a CSS fix would appear to work in the
//     device toolbar and do nothing on the actual device.
//
// A sheet answers both by construction: every row is real DOM we style, and the
// list is always ink on paper because nothing inherits a placeholder colour.
// It is also what the rest of this family already does — CLAUDE.md prefers
// bottom sheets, and every other list of choices on these pages is one.
//
// The face keeps the old .sel geometry (50px, 2px ink frame, drawn chevron) so
// it still sits in a form row exactly where the <select> did.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./state-picker.module.css";
import { useSheetDrag } from "./use-sheet-drag";

export type StateOption = readonly [code: string, name: string];

/**
 * The 50 states plus DC, as [code, name].
 *
 * A page may pass its own `options` — Smart Proposal does, because its list is
 * part of a fixture carried over verbatim from the desktop donor. This default
 * exists for the pages whose fixture holds only two-letter codes (the roof
 * estimator's STATES is a string[]), where rendering a bare "WA" would make the
 * user supply the mapping from memory.
 */
export const US_STATES: readonly StateOption[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"],
  ["CA", "California"], ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"],
  ["DC", "District of Columbia"], ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"],
  ["ID", "Idaho"], ["IL", "Illinois"], ["IN", "Indiana"], ["IA", "Iowa"],
  ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"], ["ME", "Maine"],
  ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"],
  ["NV", "Nevada"], ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"],
  ["NY", "New York"], ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"],
  ["OK", "Oklahoma"], ["OR", "Oregon"], ["PA", "Pennsylvania"], ["RI", "Rhode Island"],
  ["SC", "South Carolina"], ["SD", "South Dakota"], ["TN", "Tennessee"], ["TX", "Texas"],
  ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"], ["WA", "Washington"],
  ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
];

type Props = {
  /** Two-letter code, or "" for unpicked. */
  value: string;
  onChange: (code: string) => void;
  /** [code, name] pairs. Pass a page fixture, or omit for the canonical US list. */
  options?: readonly StateOption[];
  /** Ties the face to the form's <label htmlFor>. */
  id?: string;
  placeholder?: string;
  /** Sheet heading. */
  title?: string;
  className?: string;
};

export function StatePicker({
  value,
  onChange,
  options = US_STATES,
  id,
  placeholder = "State…",
  title = "Select state",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const faceRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const picked = useMemo(
    () => options.find((o) => o[0] === value) ?? null,
    [options, value],
  );

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return options;
    // Code first so typing "wa" surfaces Washington above Iowa/Delaware, which
    // merely contain the letters.
    const byCode = options.filter((o) => o[0].toLowerCase().startsWith(needle));
    const byName = options.filter(
      (o) => !o[0].toLowerCase().startsWith(needle) && o[1].toLowerCase().includes(needle),
    );
    return [...byCode, ...byName];
  }, [options, q]);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    // Return focus to the field, or the picker is a dead end for the keyboard.
    faceRef.current?.focus();
  }, []);

  // Escape closes the PICKER, not whatever sheet is underneath it. Capture
  // phase plus stopPropagation, because these fields sit inside form sheets
  // that run their own document-level Escape handler.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);

  // Open with the current value in view and the search ready. The delay is the
  // sheet's own 300ms travel — focusing mid-flight fights the transform on iOS.
  useEffect(() => {
    if (!open) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => {
      listRef.current?.querySelector<HTMLElement>("[data-on='1']")?.scrollIntoView({
        block: "center",
      });
      searchRef.current?.focus();
    }, reduce ? 0 : 300);
    return () => window.clearTimeout(t);
  }, [open]);

  const pick = (code: string) => {
    onChange(code);
    close();
  };

  // The 51-row list scrolls, so the pull only takes over from the head or once
  // the list is back at the top — see use-sheet-drag for the full rule.
  const drag = useSheetDrag(open, close);

  return (
    <>
      <button
        type="button"
        id={id}
        ref={faceRef}
        className={[styles.face, className].filter(Boolean).join(" ")}
        data-empty={picked ? "0" : "1"}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className={styles.faceTxt}>
          {picked ? `${picked[0]} — ${picked[1]}` : placeholder}
        </span>
      </button>

      <div
        className={[styles.ov, open ? styles.on : ""].filter(Boolean).join(" ")}
        onClick={close}
        aria-hidden="true"
      />
      <div
        className={[styles.sheet, open ? styles.on : ""].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...drag.sheetProps}
      >
        <div className={styles.grab} {...drag.handleProps} />
        <div className={styles.head} {...drag.handleProps}>
          <div className={styles.kicker}>Location</div>
          <div className={styles.title}>{title}</div>
        </div>

        <div className={styles.srch}>
          <input
            ref={searchRef}
            className={styles.srchIn}
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="Filter by code or name"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q ? (
            <button type="button" className={styles.srchX} onClick={() => setQ("")} aria-label="Clear filter">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        <div className={styles.body} ref={listRef}>
          {shown.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyT}>No match</div>
              <div className={styles.emptyB}>
                Nothing matches “{q.trim()}”. Check the spelling or clear the filter.
              </div>
              <button type="button" className={styles.emptyBtn} onClick={() => setQ("")}>
                Clear filter
              </button>
            </div>
          ) : (
            shown.map(([code, name]) => {
              const on = code === value;
              return (
                <button
                  type="button"
                  key={code}
                  data-on={on ? "1" : "0"}
                  className={[styles.row, on ? styles.rowOn : ""].filter(Boolean).join(" ")}
                  onClick={() => pick(code)}
                >
                  <span className={styles.code}>{code}</span>
                  <span className={styles.name}>{name}</span>
                  {on ? (
                    <svg
                      className={styles.tick}
                      viewBox="0 0 24 24"
                      width="18"
                      height="18"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="m20 6-11 11-5-5" />
                    </svg>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        <button type="button" className={styles.cancel} onClick={close}>
          Cancel
        </button>
      </div>
    </>
  );
}
