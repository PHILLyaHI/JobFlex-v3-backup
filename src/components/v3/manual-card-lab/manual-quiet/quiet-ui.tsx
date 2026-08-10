"use client";

// QUIET — the primitive layer.
//
// Everything in this file exists to make de-emphasis the DEFAULT. A label that
// is hard to make loud, a card head with nowhere to hang a badge, and a button
// whose base weight is "quiet" are cheaper guarantees than a review checklist.
//
// Two decisions worth stating:
//
// 1. `Card` takes a number and a title and NOTHING else — no description slot,
//    no badge slot, no trailing chip. The rejected build wore a status pill on
//    every card head ("Titled", "On file", "Balanced") and the sum of ten of
//    them was noise, so the shape of this component simply cannot express one.
//
// 2. `NumField` keeps a local string buffer while it is focused. Committing
//    Number(e.target.value) straight to state re-renders "0." as "0" and makes
//    it literally impossible to type "0.62" — the buffer is what makes a
//    controlled numeric input behave like an uncontrolled one for the duration
//    of a keystroke run, and it is dropped on blur so the formatter wins again.

import { useId, useState } from "react";
import styles from "./manual-quiet.module.css";

/** Local class joiner. Deliberately NOT `@/lib/cn`: that runs twMerge, which
 *  has opinions about Tailwind utilities and no business near a hashed
 *  CSS-module name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** One symbol from the shell's sprite (mounted once by blueprint-shell).
 *  `.ic` is the shell's global icon class — 24x24 grid, stroke 2,
 *  currentColor. Size overrides live in the module, written with enough
 *  classes to beat `.bp :global(svg.ic)`. */
export function Ic({ name }: { name: string }) {
  return (
    <svg className="ic" aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/* ============================================================
   CARD
   ============================================================ */

export function Card({
  num,
  title,
  id,
  sheet,
  children,
}: {
  num: string;
  title: string;
  id: string;
  /** Card 10 only: the printed document reads as paper, not as a form. */
  sheet?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cx(styles.card, sheet && styles.cardSheet)}
      aria-labelledby={`${id}-t`}
    >
      <header className={styles.cardHead}>
        <span className={styles.num}>{num}</span>
        <h2 id={`${id}-t`} className={styles.cardTitle}>
          {title}
        </h2>
      </header>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

/** A block of related fields. 16px inside, 32px between blocks — the two
 *  distances that do all the grouping this page has. */
export function Group({ children }: { children: React.ReactNode }) {
  return <div className={styles.group}>{children}</div>;
}

export function Pair({ children }: { children: React.ReactNode }) {
  return <div className={styles.grid2}>{children}</div>;
}

export function SubHead({ children }: { children: React.ReactNode }) {
  return <div className={styles.subHead}>{children}</div>;
}

/* ============================================================
   FIELDS
   ============================================================ */

/**
 * Label + control + optional ≤6-word hint.
 *
 * The label is a real `<label for>` when there is a control id to point at and
 * a plain span otherwise — a `<label>` wrapping a popover trigger is associated
 * with nothing, and the screen reader just orphans the word.
 */
export function Field({
  label,
  hint,
  htmlFor,
  small,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  const cls = small ? styles.labelSm : styles.label;
  return (
    <div className={styles.field}>
      {htmlFor ? (
        <label className={cls} htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className={cls}>{label}</span>
      )}
      {children}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export function TextField({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      className={styles.input}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  rows = 4,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <textarea
      id={id}
      className={styles.textarea}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function Select<T extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
}: {
  id?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <span className={styles.selWrap}>
      <select
        id={id}
        className={styles.select}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value as T)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className={styles.selChev}>
        <Ic name="chev" />
      </span>
    </span>
  );
}

/** Numeric entry with an optional in-box affix. See the buffer note at the top
 *  of this file for why `buf` exists. */
export function NumField({
  id,
  value,
  onChange,
  prefix,
  suffix,
  ariaLabel,
  max,
}: {
  id?: string;
  value: number;
  onChange: (n: number) => void;
  prefix?: string;
  suffix?: string;
  ariaLabel?: string;
  max?: number;
}) {
  const [buf, setBuf] = useState<string | null>(null);
  const shown = buf ?? String(value);

  return (
    <span className={cx(styles.numWrap, prefix && styles.hasPre, suffix && styles.hasSuf)}>
      {prefix ? <span className={cx(styles.affix, styles.affixPre)}>{prefix}</span> : null}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className={styles.input}
        value={shown}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          setBuf(raw);
          if (raw.trim() === "") {
            onChange(0);
            return;
          }
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) onChange(max != null ? Math.min(n, max) : n);
        }}
        onBlur={() => setBuf(null)}
      />
      {suffix ? <span className={cx(styles.affix, styles.affixSuf)}>{suffix}</span> : null}
    </span>
  );
}

/* ============================================================
   BUTTONS
   ============================================================ */

export function Btn({
  children,
  onClick,
  tone = "plain",
  icon,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: "plain" | "primary" | "quiet" | "add" | "danger";
  icon?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={cx(
        styles.btn,
        tone === "primary" && styles.btnPrimary,
        tone === "quiet" && styles.btnQuiet,
        tone === "add" && styles.btnAdd,
        tone === "danger" && styles.btnDanger,
      )}
      onClick={onClick}
    >
      {icon ? <Ic name={icon} /> : null}
      {children}
    </button>
  );
}

export function IconBtn({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={styles.iconBtn} aria-label={label} onClick={onClick}>
      <Ic name={icon} />
    </button>
  );
}

/* ============================================================
   TOGGLES
   The whole row is the control — that is how a 26px switch gets a
   56px target without drawing a 56px switch.
   ============================================================ */

export function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={styles.toggleRow}
      onClick={() => onChange(!on)}
    >
      <span className={styles.toggleText}>{label}</span>
      <span className={cx(styles.switch, on && styles.switchOn)} aria-hidden="true">
        <span className={styles.knob} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const groupId = useId();
  return (
    <div className={styles.segRow}>
      <span className={styles.toggleText} id={groupId}>
        {label}
      </span>
      <div className={styles.seg} role="radiogroup" aria-labelledby={groupId}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={cx(styles.segBtn, value === o.value && styles.segBtnOn)}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   DERIVED FIGURE ROWS
   ============================================================ */

export function DRow({
  label,
  value,
  lead,
}: {
  label: string;
  value: string;
  /** The one figure in the block that is allowed to be bigger. */
  lead?: boolean;
}) {
  return (
    <div className={cx(styles.dRow, lead && styles.dRowLead)}>
      <span className={styles.dLabel}>{label}</span>
      <span className={cx(styles.dValue, lead && styles.dValueLead)}>{value}</span>
    </div>
  );
}
