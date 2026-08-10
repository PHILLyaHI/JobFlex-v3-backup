"use client";

// CHAPTERS — the control vocabulary. Small, hand-rolled, no Radix.
//
// Route: /dashboard/manual-sheet.
//
// Every chapter card is built from the same eight pieces, and that is the point:
// a 1400px card stops reading as a wall the moment its parts are predictable.
// A field is ALWAYS label-then-control at 6px, blocks are ALWAYS 32px apart, and
// there is exactly one shape for a toggle, one for a choice-of-two and one for a
// choice-of-many. Nothing in a chapter gets a bespoke layout.
//
// THE LABEL RULE. Labels are sentence-case Inter at 12.5px in --muted — NOT
// all-caps mono. Mono is the annotation layer here and is spent only on figures,
// ids, unit codes and the chapter/section numerals; caps is spent only on the
// two heading levels. Putting both on every field label is what made the
// rejected build read as shouting.
//
// NumIn buffers its own text. Binding a number field straight to a number means
// the field can never be empty and never hold "8." mid-keystroke — the model
// rewrites the box under the caret. So the box owns a string while it is being
// typed in and the model gets the parsed value; on blur the buffer is dropped
// and the box re-syncs to the model, which is also what makes clamping visible
// rather than fought.

import { useId, useState } from "react";
import s from "./manual-sheet.module.css";

/* ============================================================
   HEADINGS
   ============================================================ */

/** The sub-block head: the original brief section number, then a short noun.
 *  This is the only thing separating two blocks inside a chapter besides 32px
 *  of air — no nested card, no rule. */
export function BlockHead({ num, name }: { num: string; name: string }) {
  return (
    <div className={s.blockHead}>
      <span className={s.blockNum}>{num}</span>
      <h3 className={s.blockName}>{name}</h3>
    </div>
  );
}

/* ============================================================
   FIELDS
   ============================================================ */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  /** ≤ 6 words, and only where the control genuinely cannot say it itself. */
  hint?: React.ReactNode;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div className={s.field}>
      <label className={s.lab} htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint ? <p className={s.hint}>{hint}</p> : null}
    </div>
  );
}

export function TextIn({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <input
      id={id}
      type="text"
      className={[s.in, className].filter(Boolean).join(" ")}
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
  tall,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  tall?: boolean;
}) {
  return (
    <textarea
      id={id}
      className={[s.ta, tall ? s.taTall : null].filter(Boolean).join(" ")}
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
  className,
}: {
  id?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      className={[s.sel, className].filter(Boolean).join(" ")}
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
  );
}

export function NumIn({
  id,
  value,
  onChange,
  prefix,
  suffix,
  min = 0,
  max,
  step = "any",
  ariaLabel,
  className,
}: {
  id?: string;
  value: number;
  onChange: (v: number) => void;
  /** "$" — drawn inside the box, never as a separate label. */
  prefix?: string;
  /** "%" */
  suffix?: string;
  min?: number;
  max?: number;
  step?: number | "any";
  ariaLabel?: string;
  className?: string;
}) {
  const [buf, setBuf] = useState<string | null>(null);
  const shown = buf ?? (Number.isFinite(value) ? String(value) : "");

  const commit = (raw: string) => {
    setBuf(raw);
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      onChange(0);
      return;
    }
    let next = n;
    if (typeof min === "number" && next < min) next = min;
    if (typeof max === "number" && next > max) next = max;
    onChange(next);
  };

  const box = (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      className={[
        s.in,
        s.inNum,
        prefix ? s.affixPre : null,
        suffix ? s.affixSuf : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      value={shown}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      onChange={(e) => commit(e.target.value)}
      onBlur={() => setBuf(null)}
    />
  );

  if (!prefix && !suffix) return box;

  return (
    <span className={s.affix}>
      {box}
      {prefix ? (
        <span className={[s.affixMark, s.affixMarkPre].join(" ")} aria-hidden="true">
          {prefix}
        </span>
      ) : null}
      {suffix ? (
        <span className={[s.affixMark, s.affixMarkSuf].join(" ")} aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

/* ============================================================
   CHOICES
   ============================================================ */

export function Seg<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className={s.seg} role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={[s.segBtn, o.value === value ? s.isOn : null].filter(Boolean).join(" ")}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Label left, switch right, the whole 52px row is the target. */
export function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={s.switchRow}
      onClick={() => onChange(!checked)}
    >
      <span className={s.switchLab}>{label}</span>
      <span
        className={[s.switchTrack, checked ? s.isOn : null].filter(Boolean).join(" ")}
        aria-hidden="true"
      >
        <span className={s.switchKnob} />
      </span>
    </button>
  );
}

/* ============================================================
   BUTTONS
   ============================================================ */

export function Btn({
  children,
  onClick,
  tone = "ghost",
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "ghost" | "primary" | "danger";
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={[
        s.btn,
        tone === "primary" ? s.btnPrimary : null,
        tone === "danger" ? s.btnDanger : null,
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function TextBtn({
  children,
  onClick,
  quiet,
  ariaLabel,
}: {
  children: React.ReactNode;
  onClick: () => void;
  quiet?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      className={[s.btnText, quiet ? s.btnQuiet : null].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ============================================================
   GLYPHS
   Plain inline SVG, sized by this module's own class. Deliberately
   NOT the shell's `.ic` class, which is pinned to 17px by a
   (0,2,1) rule that would need a three-class selector to beat.
   ============================================================ */

export function Caret({ open }: { open: boolean }) {
  return (
    <svg
      className={[s.glyph, open ? s.glyphOpen : null].filter(Boolean).join(" ")}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

export function Cross() {
  return (
    <svg
      className={s.glyph}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}
