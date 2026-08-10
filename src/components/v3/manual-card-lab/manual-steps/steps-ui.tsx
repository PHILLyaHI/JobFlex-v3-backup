"use client";

// STEPS — the control vocabulary. Every input on the page is one of these.
//
// THE ONE IDEA: THE FIELD IS A WELL, NOT A BOX.
// The card surface is LIGHTER than the paper ground (that is what makes it read
// as lifted without a black border). So an input painted in the ground colour
// reads as a recess in that surface — a well — and needs no outline at all to
// be obviously typeable. That is one less border per field across ~30 fields,
// which is most of the "clenched up" feeling the old build had. The 1px edge
// that remains is 8% ink: enough to crisp the shape, not enough to count as a
// line. Focus is the only place blue appears outside the primary action.
//
// LABELS ARE NOT MONO AND NOT CAPS. Mono ALL-CAPS on every field was one of the
// four rejected anti-patterns: it makes thirty equal shouts and leaves nothing
// for the annotation layer to mean. Mono here is reserved for figures, section
// numerals and the sticky bar's meta line. Labels are 12px, normal weight,
// muted — secondary by size and colour, exactly as the hierarchy rules ask.
//
// NUMBERS KEEP A TEXT DRAFT. A number field that re-formats on every keystroke
// eats the "." out of "8.25" and the "-" out of a negative. Each numeric input
// holds the raw string while it is focused (`draft`) and falls back to the
// canonical value on blur, so the caret never jumps and the model still only
// ever receives a real number.
//
// Every interactive element is ≥44px on its shortest axis. The specificity note
// at the top of the CSS module explains why none of these use bare type
// selectors: the always-on modules strip `button` and `input` app-wide.

import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import s from "./manual-steps.module.css";

/* ── glyphs ────────────────────────────────────────────────────────────────
   Inline SVG with this module's own class, never `.ic`: the always-on modules
   pin `svg.ic` at 17px with (0,2,1), and matching that would cost three
   classes on every icon rule for no gain. */

export function Glyph({ d, className }: { d: string; className?: string }) {
  return (
    <svg
      className={className ? `${s.gl} ${className}` : s.gl}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export const PATH = {
  chevronDown: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  undo: "M3 8h11a5 5 0 010 10H8M3 8l4-4M3 8l4 4",
  check: "M4 12.5l5 5L20 6.5",
};

/* ── layout ─────────────────────────────────────────────────────────────── */

/** A block inside an open card. Blocks are separated by 32px of nothing — the
 *  law of proximity does the grouping, so there is no rule and no sub-card. */
export function Block({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className={s.block}>
      {title ? <h3 className={s.blockTitle}>{title}</h3> : null}
      {children}
    </div>
  );
}

/** A stack of fields, 16px apart — close enough to read as one group, far
 *  enough that no label sits on its neighbour's value. */
export function Fields({ children }: { children: ReactNode }) {
  return <div className={s.fields}>{children}</div>;
}

/** The only grid on the page, and only for SHORT numeric fields. A section is
 *  never split into columns; four percentages stacked would be 260px of column
 *  spent on four two-character values. */
export function NumGrid({ children }: { children: ReactNode }) {
  return <div className={s.numGrid}>{children}</div>;
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={s.field}>
      <label className={s.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className={s.hint}>{hint}</p> : null}
    </div>
  );
}

/* ── text ───────────────────────────────────────────────────────────────── */

export function TextInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  return (
    <input
      id={id}
      className={s.input}
      type="text"
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
  placeholder,
  rows = 5,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      id={id}
      className={s.area}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ── numbers ────────────────────────────────────────────────────────────── */

function toText(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

export function NumberInput({
  id,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max,
  step = 1,
  ariaLabel,
  align = "left",
}: {
  id?: string;
  value: number;
  onChange: (next: number) => void;
  prefix?: string;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  ariaLabel?: string;
  align?: "left" | "right";
}) {
  // While focused the raw string wins; on blur the canonical number does.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? toText(value);

  return (
    <div className={s.numWrap} data-align={align}>
      {prefix ? <span className={s.affix}>{prefix}</span> : null}
      <input
        id={id}
        className={s.numInput}
        type="number"
        inputMode="decimal"
        value={shown}
        min={min}
        max={max}
        step={step}
        aria-label={ariaLabel}
        onChange={(e) => {
          const raw = e.target.value;
          setDraft(raw);
          const n = Number(raw);
          if (raw.trim() === "") onChange(0);
          else if (Number.isFinite(n)) onChange(clamp(n, min, max));
        }}
        onBlur={() => setDraft(null)}
      />
      {suffix ? <span className={s.affix}>{suffix}</span> : null}
    </div>
  );
}

function clamp(n: number, min?: number, max?: number): number {
  let v = n;
  if (typeof min === "number" && v < min) v = min;
  if (typeof max === "number" && v > max) v = max;
  return v;
}

/* ── choice ─────────────────────────────────────────────────────────────── */

export function Select({
  id,
  value,
  onChange,
  children,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className={s.selWrap}>
      <select
        id={id}
        className={s.select}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      <Glyph d={PATH.chevronDown} className={s.selChevron} />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  compact,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (next: T) => void;
  ariaLabel: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? `${s.seg} ${s.segCompact}` : s.seg} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={s.segBtn}
          data-on={value === o.value ? "1" : undefined}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Whole-row switch: the label is part of the target, so the hit area is the
 *  full width of the card rather than a 44px knob at the far right. */
export function Toggle({
  label,
  note,
  on,
  onChange,
}: {
  label: string;
  note?: string;
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={s.togRow}
      onClick={() => onChange(!on)}
    >
      <span className={s.togText}>
        <span className={s.togLabel}>{label}</span>
        {note ? <span className={s.togNote}>{note}</span> : null}
      </span>
      <span className={s.togTrack} data-on={on ? "1" : undefined}>
        <span className={s.togKnob} />
      </span>
    </button>
  );
}

/* ── actions ────────────────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "solid" | "ghost" | "quiet" | "danger";
};

export function Btn({ variant = "ghost", className, children, ...rest }: BtnProps) {
  const cls = [s.btn, s[`btn_${variant}`], className].filter(Boolean).join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

/** Square 44px control for destructive row actions. Always carries a label —
 *  an unlabelled × is invisible to a screen reader and ambiguous to everyone. */
export function IconBtn({
  label,
  onClick,
  d = PATH.close,
}: {
  label: string;
  onClick: () => void;
  d?: string;
}) {
  return (
    <button type="button" className={s.iconBtn} onClick={onClick} aria-label={label} title={label}>
      <Glyph d={d} />
    </button>
  );
}

/* ── read-out ───────────────────────────────────────────────────────────── */

/** A derived figure: label left, value right, tabular. No leader dots — the
 *  device was cut on purpose; alignment already pairs the two. */
export function Derived({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "err";
  strong?: boolean;
}) {
  return (
    <div className={strong ? `${s.derived} ${s.derivedStrong}` : s.derived}>
      <span className={s.derivedLabel}>{label}</span>
      <span className={s.derivedVal} data-tone={tone}>
        {value}
      </span>
    </div>
  );
}

/** Six words maximum. Anything longer is a paragraph in a card, which nobody
 *  reads and which was rejected by name. */
export function Note({ children, tone }: { children: ReactNode; tone?: "warn" | "ok" }) {
  return (
    <p className={s.note} data-tone={tone}>
      {children}
    </p>
  );
}
