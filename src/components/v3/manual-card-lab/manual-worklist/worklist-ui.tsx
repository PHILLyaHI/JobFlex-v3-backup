"use client";

// WORKLIST — the shared vocabulary. Every card on the page is built from these
// six pieces and nothing else, which is what keeps eight very different
// subjects reading as one worklist.
//
// Principle 6 from the brief — "every row grammar must be unmistakable" — is
// enforced here rather than per card: there is ONE labelled-field shape, ONE
// toggle, ONE stamp, ONE slider. A seventh weight would have to be added in
// this file, in front of the other six, which is the point.
//
// Reuse note: `src/components/ui/` was checked first, as the brief requires.
// Its Button / Input / Card / Toast are the sage-era Tailwind primitives the
// live app uses; dropped onto the blueprint shell they arrive with their own
// radii, shadows and focus rings and fight the drawing. The blueprint fleet's
// answer to that is a per-page CSS module, which is what this lab does — the
// same call `manual-run` and the 22 ported pages made. Toast in particular is
// a store + a `<ToastHost>` mounted in the classic dashboard layout, which the
// blueprint shell does not render, so it would have been a silent no-op here.

import { useId, useState } from "react";
import styles from "./manual-worklist.module.css";

/** Local class joiner. Deliberately NOT `lib/cn`: that runs twMerge, which has
 *  opinions about Tailwind utilities and no business near a hashed module
 *  class name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** The sprite icon, at the shell's stroke and grid. */
export function Icon({ name }: { name: string }) {
  return (
    <svg className="ic" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/** The drawing-annotation register: mono, small, wide-tracked, quiet. */
export function Ann({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx(styles.ann, className)}>{children}</span>;
}

/**
 * A labelled control. The label is a real `<label>` bound to the control by id,
 * so clicking it focuses the field and a screen reader announces the pair —
 * the caps micro-label above the frame is the blueprint's field grammar, not a
 * decorative caption.
 */
export function Field({
  label,
  optional,
  hint,
  children,
  className,
}: {
  label: string;
  optional?: boolean;
  /** One quiet line under the control. Never restates the label. */
  hint?: React.ReactNode;
  /** Receives the generated id — spread it onto the control. */
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.lab} htmlFor={id}>
        {label}
        {optional && <span className={styles.labOpt}> · optional</span>}
      </label>
      {children(id)}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

/**
 * A numeric input that lets you type.
 *
 * A plainly controlled `value={String(n)}` field is unusable for money: typing
 * "2." parses to 2, re-renders as "2", and eats the decimal point the instant
 * it is typed. The same happens to a leading "0.", to a cleared field, and to
 * every trailing zero.
 *
 * So the field is authoritative WHILE IT HAS FOCUS — the raw keystrokes live in
 * a local buffer and the parsed number is reported upward on every change — and
 * reverts to the canonical formatting on blur. No effect, no state written
 * during render, and an external reset (Undo, Reset) lands correctly because
 * an unfocused field always renders from the value it was handed.
 */
export function NumberInput({
  id,
  value,
  onChange,
  className,
  min,
  max,
  step,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: number;
  onChange: (next: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [buffer, setBuffer] = useState<string | null>(null);
  const shown = buffer ?? (Number.isFinite(value) ? String(value) : "");

  return (
    <input
      id={id}
      className={cx(styles.in, styles.numIn, className)}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      value={shown}
      onFocus={() => setBuffer(Number.isFinite(value) ? String(value) : "")}
      onChange={(e) => {
        setBuffer(e.target.value);
        const parsed = e.target.value.trim() === "" ? 0 : Number(e.target.value);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
      onBlur={() => setBuffer(null)}
    />
  );
}

/** A currency frame: a fixed "$" inside the border, the number right-aligned
 *  and tabular so digit columns line up like an estimate sheet. */
export function MoneyFrame({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.moneyIn}>
      <span aria-hidden="true">$</span>
      {children}
    </span>
  );
}

/** The same idea on the other side, for a percentage. */
export function PctFrame({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.pctIn}>
      {children}
      <span aria-hidden="true">%</span>
    </span>
  );
}

/**
 * The check-stamp. A black stamp when the condition is met, a dashed hollow box
 * when it is not, rotated a touch so it reads as pressed onto the sheet rather
 * than drawn into the layout.
 *
 * Purely decorative to a screen reader — the state it encodes is always spoken
 * in text next to it (see `RuleLine` and `Receipt`).
 */
export function Stamp({ done, big }: { done: boolean; big?: boolean }) {
  return (
    <span
      className={cx(styles.stamp, big && styles.stampBig, done && styles.stampDone)}
      aria-hidden="true"
    >
      <Icon name="check" />
    </span>
  );
}

/**
 * A hand-rolled switch. `role="switch"` on a real button, so it is keyboard
 * operable, announces its state, and hits the 44px touch floor through the
 * whole row rather than the 52×28 track alone.
 *
 * The four proposal options use this and nothing else uses it — the page has no
 * other binary control, and a second one would need a reason.
 */
export function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  help: string;
}) {
  const helpId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={helpId}
      className={cx(styles.toggle, checked && styles.isOn)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.toggleTrack} aria-hidden="true">
        <span className={styles.toggleKnob} />
      </span>
      <span className={styles.toggleCopy}>
        <span className={styles.toggleLab}>{label}</span>
        <span className={styles.toggleHelp} id={helpId}>
          {help}
        </span>
      </span>
      <span className={styles.toggleState} aria-hidden="true">
        {checked ? "On" : "Off"}
      </span>
    </button>
  );
}

/**
 * A markup control: a draggable bar AND a typeable number, because a contractor
 * setting 18% by hand should not have to hit a pixel, and one dragging toward a
 * target margin should not have to type.
 *
 * `base` and `added` are printed under the bar so the control says what it
 * actually did to the money — "consequence in place", instead of asking the
 * reader to trust a percentage.
 */
export function MarkupControl({
  label,
  caption,
  value,
  max,
  onChange,
  baseLabel,
  addedLabel,
}: {
  label: string;
  /** "markup over base" / "of subtotal" / "of cost + overhead". */
  caption: string;
  value: number;
  max: number;
  onChange: (next: number) => void;
  baseLabel: string;
  addedLabel: string;
}) {
  const id = useId();
  const numId = useId();
  const clamped = Math.min(max, Math.max(0, Number.isFinite(value) ? value : 0));

  return (
    <div className={styles.mk}>
      <div className={styles.mkHead}>
        <label className={styles.mkLab} htmlFor={id}>
          {label}
        </label>
        <span className={styles.mkCap}>{caption}</span>
        <span className={styles.mkNum}>
          <label className={styles.srOnly} htmlFor={numId}>
            {label} percent
          </label>
          <NumberInput
            id={numId}
            className={styles.mkIn}
            value={clamped}
            min={0}
            max={max}
            step={0.5}
            onChange={(next) => onChange(Math.min(max, Math.max(0, next)))}
          />
          <span aria-hidden="true">%</span>
        </span>
      </div>

      <input
        id={id}
        className={styles.mkRange}
        type="range"
        min={0}
        max={max}
        step={0.5}
        value={clamped}
        onChange={(e) => onChange(Number(e.target.value))}
      />

      <div className={styles.mkFoot}>
        <span>{baseLabel}</span>
        <span className={styles.num}>{addedLabel}</span>
      </div>
    </div>
  );
}

/** An empty state — a note on a drawing, per the system's signature element. */
export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

/**
 * The busy mark on a save button: a quarter-ring that turns.
 *
 * The rotation is driven by the Web Animations API rather than CSS, because
 * Lightning CSS rejects `@keyframes` inside a CSS module and this variant may
 * not add to the shell's global stylesheet (see the header of
 * manual-worklist.module.css). A ring that does not turn reads as a broken
 * button, so the choice was a real animation or none at all.
 *
 * The `ref` callback is the whole implementation: it fires on mount with the
 * element and on unmount with null, which is exactly the animation's lifetime.
 * Reduced motion gets the static ring — still a legible "busy", with no spin.
 */
export function Spinner() {
  return (
    <span
      className={styles.spinner}
      aria-hidden="true"
      ref={(el) => {
        if (!el) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const anim = el.animate(
          [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
          { duration: 780, iterations: Infinity, easing: "linear" },
        );
        return () => anim.cancel();
      }}
    />
  );
}
