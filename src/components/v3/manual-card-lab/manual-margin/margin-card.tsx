"use client";

// PRICE FIRST — the shared card shell and the two-line helpers every card in
// the column uses. (route: /dashboard/manual-margin)
//
// Design thesis, in this file: the column must not read as a pile. Eight peer
// cards stacked vertically lose their sequence, so every card head carries the
// same three-part device — a station NUMERAL, a content SUMMARY (never just
// the card's own name), and a PRICE-EFFECT tag that answers the one question
// this page is organised around: what does this card do to the number? A card
// that moves money prints its contribution percentage; a card that does not
// says so out loud. That is the ordering grammar, and it is rigorous: there is
// no fourth kind of head.
//
// These components live at MODULE SCOPE. Declared inside the content component
// they would be a new function identity on every render, so React would see a
// different element type each time, unmount the card and mount a fresh one —
// which drops the caret out of whichever input is being typed in, on every
// keystroke.
//
// Fixture-only page: nothing here reads or writes anything.

import { useState, type ReactNode } from "react";
import styles from "./manual-margin.module.css";

/** Local class joiner. Deliberately NOT lib/cn: that runs twMerge, which has
 *  opinions about Tailwind utilities and no business anywhere near a hashed
 *  CSS-module name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The shell's SVG sprite is mounted once by blueprint-shell.tsx, so every
 *  icon on the page is a <use> into it rather than a second icon library. */
export function Ic({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={cx("ic", className)} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

/** How a card head reports its effect on the contract total. */
export type EffectTone = "live" | "flat" | "warn" | "ok" | "bad";

export type CardEffect = {
  /** The small caps line — "of contract total", "no price effect". */
  label: string;
  /** The figure, when there is one. Rendered in the numeral register. */
  value?: string;
  tone: EffectTone;
};

const TONE_CLASS: Record<EffectTone, string | false> = {
  live: styles.effectLive,
  flat: false,
  warn: styles.effectWarn,
  ok: styles.effectOk,
  bad: styles.effectBad,
};

/**
 * The repeating unit of the column.
 *
 * `onShut` is optional: the price card and the client's copy are never
 * collapsible (the first is the instrument, the second is the artifact), and
 * passing no handler is how a card opts out rather than a separate boolean.
 */
export function Card({
  id,
  num,
  title,
  summary,
  effect,
  shut,
  onShut,
  children,
}: {
  id: string;
  num: string;
  title: string;
  /** Summarises the card's CONTENT, so collapsing it loses nothing. */
  summary: ReactNode;
  effect: CardEffect;
  shut?: boolean;
  onShut?: () => void;
  children: ReactNode;
}) {
  const isShut = Boolean(shut);

  return (
    <section
      id={id}
      className={cx(styles.card, styles.col, isShut && styles.isShut)}
      aria-labelledby={`${id}-title`}
    >
      <header className={styles.cardHead}>
        <span className={styles.cardNum} aria-hidden="true">
          {num}
        </span>
        <div className={styles.cardCopy}>
          <h2 className={styles.cardTitle} id={`${id}-title`}>
            <span className={styles.srOnly}>Card {num}: </span>
            {title}
          </h2>
          <p className={styles.cardSum}>{summary}</p>
        </div>

        <span className={cx(styles.effect, TONE_CLASS[effect.tone])}>
          {effect.value ? (
            <>
              <b>{effect.value}</b>
              {effect.label}
            </>
          ) : (
            effect.label
          )}
        </span>

        {onShut && (
          <button
            type="button"
            className={cx(styles.shutBtn, isShut && styles.isShutBtn)}
            onClick={onShut}
            aria-expanded={!isShut}
            aria-controls={`${id}-body`}
          >
            <Ic id="i-chev" />
            <span className={styles.srOnly}>
              {isShut ? `Open ${title}` : `Collapse ${title}`}
            </span>
          </button>
        )}
      </header>

      {/* Unmounted rather than hidden when shut. Nothing in a collapsed card
          needs to keep running, and a `display: none` subtree is where the
          fleet's stagger bugs come from. */}
      {!isShut && (
        <div className={styles.cardBody} id={`${id}-body`}>
          {children}
        </div>
      )}
    </section>
  );
}

/** Label + control, the page's one field grammar. */
export function Field({
  label,
  optional,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.lab} htmlFor={htmlFor}>
        {label}
        {optional && <span className={styles.labOpt}> · optional</span>}
      </label>
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

/**
 * A number field that commits on every keystroke but does not fight the
 * keyboard.
 *
 * Binding `value={String(n)}` straight to a number is the obvious version and
 * it is unusable on this page: typing "18." re-renders as "18" and eats the
 * decimal point, and clearing a field to retype it snaps back to "0". So the
 * raw text is buffered WHILE THE FIELD IS FOCUSED and released on blur, and
 * the parsed number is pushed up on every keystroke — which is what keeps the
 * contract total, the reconciliation and the sticky strip moving live as the
 * contractor types, the behaviour this whole design rests on.
 */
export function NumInput({
  value,
  onChange,
  className,
  id,
  ariaLabel,
  min,
  max,
  step,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  className: string;
  id?: string;
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const [buf, setBuf] = useState<string | null>(null);
  const text = buf ?? (Number.isFinite(value) ? String(value) : "");

  return (
    <input
      type="number"
      inputMode="decimal"
      className={className}
      id={id}
      aria-label={ariaLabel}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setBuf(raw);
        if (raw.trim() === "") {
          onChange(0);
          return;
        }
        const n = Number.parseFloat(raw);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      onBlur={() => setBuf(null)}
    />
  );
}

/** A note on a drawing — the system's empty-state signature. */
export function Empty({ kicker, children }: { kicker: string; children: ReactNode }) {
  return (
    <div className={styles.empty}>
      <b>{kicker}</b>
      {children}
    </div>
  );
}
