"use client";

// PROOF CARD — the field vocabulary (route: /dashboard/manual-proof).
//
// ONE grammar for every control on the page, declared once. The card bodies are
// long; if each of them spelled out its own input treatment the page would
// drift into six dialects by the third card, which is the exact failure the
// design decisions file warns about for typography.
//
// Two deliberate reuses of shared infrastructure rather than local re-derivation:
//   · `<select>` — the ONE styled select in the codebase is `.bp-sel` /
//     `.bp-sel-in` in dashboard-blueprint/blueprint-global.css, published app
//     wide and mounted by the shell. A page that re-derives `appearance: none`
//     plus its own caret is a second implementation of a solved control.
//   · icons — the shell mounts the sprite once; every icon here is a
//     `<use href="#i-…">` against it, at the house 24×24 / stroke-2 geometry.
//
// Fixture-only page: nothing in this file reads or writes anything outside the
// props it is handed.

import type { ChangeEvent, ReactNode } from "react";
import { cx } from "./proof-card";
import styles from "./manual-proof.module.css";

/** A sprite icon. `aria-hidden` by default — every control that carries one
 *  also carries its own accessible name. */
export function Ic({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={cx("ic", className)} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** A labelled block. `as="label"` when it wraps exactly one control (the label
 *  then IS the association); `as="div"` when the control is a composite that
 *  brings its own labelling, like a picker. */
export function Field({
  label,
  optional,
  hint,
  as = "label",
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  as?: "label" | "div";
  children: ReactNode;
}) {
  const body = (
    <>
      <span className={styles.lab}>
        {label}
        {optional && <span className={styles.labOpt}> · optional</span>}
      </span>
      {children}
      {hint && <span className={styles.hint}>{hint}</span>}
    </>
  );
  return as === "label" ? (
    <label className={styles.field}>{body}</label>
  ) : (
    <div className={styles.field}>{body}</div>
  );
}

/** The page's text input. */
export function TextIn({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      className={styles.in}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
}

/** The page's multiline input. */
export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}) {
  return (
    <textarea
      className={styles.ta}
      rows={rows}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
    />
  );
}

/**
 * A number field with a fixed affix drawn inside its frame.
 *
 * Spinners are off: they fight tabular alignment, they are a mouse-only
 * affordance, and a 20px hit target has no business on a page that holds a
 * 44px floor everywhere else.
 */
export function NumIn({
  value,
  onChange,
  affix,
  ariaLabel,
  dense,
  min = 0,
}: {
  value: number;
  onChange: (next: number) => void;
  /** "$" draws on the left, "%" on the right. */
  affix?: "$" | "%";
  ariaLabel: string;
  /** Row-scale variant, for the dense line-item table. */
  dense?: boolean;
  min?: number;
}) {
  const input = (
    <input
      className={cx(dense ? styles.rowIn : styles.in, styles.numIn)}
      type="number"
      inputMode="decimal"
      min={min}
      step="any"
      value={value}
      aria-label={ariaLabel}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(Number(e.target.value))}
    />
  );

  if (!affix) return input;

  // The wrapper needs no dense variant: the affix sits at a fixed inset and the
  // extra padding that clears it is written against `.in` / `.rowIn`, so the
  // two scales are already handled one level down.
  return (
    <span className={affix === "$" ? styles.dollarWrap : styles.pctWrap}>
      {input}
      <span aria-hidden="true">{affix}</span>
    </span>
  );
}

/** The shared styled select. `data-empty` greys an unpicked placeholder, per
 *  the published contract. */
export function SelectIn({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <span className={cx("bp-sel", styles.sel, className)}>
      <select
        className="bp-sel-in"
        value={value}
        aria-label={ariaLabel}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/**
 * The dense icon control used inside rows. 32px: comfortably past the WCAG 2.2
 * AA 24×24 minimum, inside a row that is itself ≥48px tall. The 44px floor is
 * held on every control that carries a word.
 */
export function IconBtn({
  icon,
  label,
  onClick,
  danger,
  open,
  expanded,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Rotates a chevron 180°. */
  open?: boolean;
  /** Sets aria-expanded when the control is a disclosure. */
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      className={cx(styles.iconBtn, danger && styles.isDanger, open && styles.isOpen)}
      aria-label={label}
      // The same words on hover. An icon-only control whose meaning lives only
      // in the accessibility tree is discoverable to a screen reader and to
      // nobody else.
      title={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <Ic name={icon} />
    </button>
  );
}

/** The dashed "add another" control at the foot of every list. */
export function AddBtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={styles.addBtn} onClick={onClick}>
      <Ic name="plus" />
      {children}
    </button>
  );
}

/** A quiet inline text button — "insert template", "edit", snap-backs. */
export function LinkBtn({
  onClick,
  children,
  icon,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: string;
}) {
  return (
    <button type="button" className={styles.link} onClick={onClick}>
      {icon && <Ic name={icon} />}
      {children}
    </button>
  );
}

/**
 * A toggle row: label, explanatory line, and a square switch.
 *
 * A pill switch would be the only rounded object on a 2px-radius system, so the
 * switch is square. The whole row is the control — a 56px target rather than a
 * 46px one.
 */
export function ToggleRow({
  label,
  hint,
  on,
  onChange,
  effect,
}: {
  label: string;
  hint: string;
  on: boolean;
  onChange: (next: boolean) => void;
  /** What this toggle is doing to the printed document RIGHT NOW. Consequence
   *  in place: a switch that only says what it would do is a promise, not a
   *  readout. */
  effect: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={styles.tog}
      onClick={() => onChange(!on)}
    >
      <span className={styles.togCopy}>
        <span className={styles.togLab}>{label}</span>
        <span className={styles.togHint}>{hint}</span>
        <span className={cx(styles.togEffect, on && styles.isOn)}>{effect}</span>
      </span>
      <span className={cx(styles.sw, on && styles.swOn)} aria-hidden="true" />
    </button>
  );
}

/** An empty state — a note on a drawing, per the system's signature element. */
export function EmptyNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <p className={styles.empty}>
      <b>{title}</b>
      {children}
    </p>
  );
}
