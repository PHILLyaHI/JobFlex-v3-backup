"use client";

// FOCUS CARD — the shared control vocabulary (route: /dashboard/manual-focus).
//
// Every input, button, switch and empty state on the page is one of these.
// A dense single column only stays readable if the row grammars are a small,
// fixed set that cannot be confused at a squint (principle 6), and the only way
// to hold that across ten cards and roughly ninety controls is to declare each
// grammar ONCE and never re-derive it locally.
//
// WHY THESE ARE HAND-ROLLED AND NOT `@/components/ui/*`
// Those primitives are the sage-era Tailwind set: rounded corners, soft
// shadows, framer-motion, `--accent` semantics. Dropping one onto a blueprint
// card produces exactly the drift `references/decisions.md` warns about under
// "never create parallel style sets for identical blocks". `ui/Toast` in
// particular would be worse than unused — nothing mounts `<Toaster />` under the
// blueprint shell, so `toast.success(...)` here is a silent no-op. Save and
// Save & send answer in the column instead, where the answer can actually be
// seen. (`ui/Select` is skipped for the same reason the shell publishes exactly
// one styled select: a native <select> is the one control on a blueprint card
// that does not belong to the drawing, so this file styles it once.)
//
// EVERY COMPONENT HERE IS AT MODULE SCOPE. Declared inside a parent they would
// be a new function identity on every render, React would see a different
// element type, unmount the subtree and remount it — dropping the caret out of
// whichever input was being typed in, on every keystroke.
//
// FIXTURE-ONLY page: nothing in this file reads or writes anything outside the
// component tree it is rendered into.

import { useId, useState } from "react";
import styles from "./manual-focus.module.css";

/** Local class joiner. Deliberately NOT `@/lib/cn`: that runs twMerge, which
 *  has opinions about Tailwind utilities and no business anywhere near a hashed
 *  CSS-module name. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ============================================================
   ICON
   ============================================================ */

/** One symbol from the shell's sprite. `.ic` is the shell's own global icon
 *  class (24x24 grid, stroke 2, currentColor); size overrides live in the
 *  module, written with enough classes to beat `.bp :global(svg.ic)`. */
export function Ic({ name, className }: { name: string; className?: string }) {
  return (
    <svg className={cx("ic", className)} aria-hidden="true" focusable="false">
      <use href={`#i-${name}`} />
    </svg>
  );
}

/* ============================================================
   FIELDS
   ============================================================ */

/**
 * Label + control + optional helper line. The label is the mono annotation
 * register; "optional" is stated in the label rather than in a separate hint,
 * because a hint that only says "optional" is the redundant text the house
 * style deletes.
 *
 * WHY THE LABEL IS SOMETIMES A `<span>`. Two call sites wrap a PICKER — a
 * popover trigger, not a form control — and a `<label>` with no `for` and no
 * form control inside it is associated with nothing: a screen reader reads the
 * trigger's own name and leaves "Client" orphaned above it. So the element is a
 * real `<label>` exactly when there is a control id to point at, and a plain
 * span otherwise. Those two pickers carry the field name in their own
 * `aria-label` instead (see focus-pickers.tsx).
 */
export function Field({
  label,
  optional,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const text = (
    <>
      {label}
      {optional && <span className={styles.labOpt}> · optional</span>}
    </>
  );

  return (
    <div className={styles.field}>
      {htmlFor ? (
        <label className={styles.lab} htmlFor={htmlFor}>
          {text}
        </label>
      ) : (
        <span className={styles.lab}>{text}</span>
      )}
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

/** Plain single-line text. */
export function TextIn({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  inputRef,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** For the two inline forms, which have to put the caret in this field when
   *  they open and put it back when they refuse to submit. */
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      className={cx(styles.in, className)}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** Multiline prose. `rows` sets the resting height; the user can drag it. */
export function Area({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  rows?: number;
  ariaLabel?: string;
}) {
  return (
    <textarea
      id={id}
      className={styles.ta}
      rows={rows}
      value={value}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * A numeric field that survives being typed in.
 *
 * A naive `value={n} onChange={e => set(Number(e.target.value))}` cannot be
 * cleared: emptying it produces `Number("") === 0`, the 0 is written straight
 * back into the box, and the user has to select-all before every edit. It also
 * eats a trailing decimal point, so "8." can never become "8.25".
 *
 * So the KEYSTROKES live here as a string and only a parseable value is
 * committed upward. The external number is still authoritative — Reset, the
 * address-driven tax estimate and the ratio slider all write it from outside —
 * which is what the `seen` resync below is for. It is React's documented
 * "adjust some state when a prop changes" pattern: setting state during the
 * render of the SAME component, which React re-runs immediately without
 * painting, rather than an effect that would paint the stale value first.
 *
 * `seen` is state and not a ref on purpose. A ref read during render is exactly
 * what `react-hooks/refs` forbids — and correctly so: the render would not
 * re-run when the ref changed. Committing our own value into `seen` inside
 * `onChange` is what stops the resync from firing on the round trip and eating
 * a half-typed "8." on its way to "8.25".
 *
 * `min` AND `max` ARE ENFORCED HERE, not just declared on the element. As HTML
 * attributes they only decorate the spinner and the form-validity flag, and this
 * page has no form and never submits: typing 900 into a markup box whose slider
 * stops at 100 used to leave the handle pegged at 100 and the ledger charging
 * 900%, and a leading "-" used to commit a negative markup, quantity or tax rate
 * straight into the grand total. A control and its own readout disagreeing is
 * the one failure this page cannot afford, so the value that leaves this
 * component is always inside the range the caller declared. Only the COMMITTED
 * number is clamped — `text` stays the raw keystrokes so "8." survives on its
 * way to "8.25", and `onBlur` normalises the string back to the clamped value.
 */
export function NumIn({
  id,
  value,
  onChange,
  min = 0,
  max,
  step = "0.01",
  ariaLabel,
  className,
  placeholder,
}: {
  id?: string;
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: string;
  ariaLabel?: string;
  className?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => String(value));
  const [seen, setSeen] = useState(value);

  if (value !== seen) {
    setSeen(value);
    setText(String(value));
  }

  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      className={cx(styles.in, className)}
      value={text}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = raw.trim() === "" ? 0 : Number(raw);
        if (Number.isFinite(parsed)) {
          const bounded = Math.min(max ?? Infinity, Math.max(min, parsed));
          // Record it as "seen" so the round trip back through `value` does not
          // rewrite the string the user is still typing.
          setSeen(bounded);
          onChange(bounded);
        }
      }}
      onBlur={() => {
        // Leaving the field normalises whatever half-typed string is in it, so
        // "8." and "" do not stay on screen looking like values.
        setText(String(value));
      }}
    />
  );
}

/** A currency field: a fixed "$" inside the frame, the number right-aligned. */
export function MoneyIn(props: Parameters<typeof NumIn>[0]) {
  return (
    <span className={styles.moneyIn}>
      <span aria-hidden="true">$</span>
      <NumIn {...props} />
    </span>
  );
}

/** A percentage field, the same idea on the other side of the frame. */
export function PctIn(props: Parameters<typeof NumIn>[0]) {
  return (
    <span className={styles.pctIn}>
      <span aria-hidden="true">%</span>
      <NumIn {...props} />
    </span>
  );
}

/** The page's one styled `<select>`. Native, because a six-option unit picker
 *  is exactly what a native select is for on a keyboard and on a touch screen;
 *  the caret is drawn as a background image because a `<select>` cannot carry a
 *  pseudo-element. */
export function SelectIn<T extends string>({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  id?: string;
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      className={cx(styles.sel, className)}
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

/* ============================================================
   BUTTONS
   ============================================================ */

/** The dashed "add another" control at the foot of every repeating list. */
export function AddBtn({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={styles.addBtn} onClick={onClick}>
      <Ic name="plus" />
      {children}
    </button>
  );
}

/** A quiet inline text action — "Insert starter template", "Change", "Edit". */
export function LinkBtn({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={styles.link} onClick={onClick}>
      {icon && <Ic name={icon} />}
      {children}
    </button>
  );
}

/**
 * The dense icon control used inside rows. 32px square: comfortably past WCAG
 * 2.2 AA's 24x24 target minimum, inside a row that is itself at least 44px
 * tall. The project's 44px floor is held on every control that carries a word.
 */
export function IconBtn({
  icon,
  label,
  onClick,
  danger,
  disabled,
  open,
  expanded,
  buttonRef,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Rotates a chevron 180deg. */
  open?: boolean;
  /** Sets aria-expanded for a disclosure trigger. */
  expanded?: boolean;
  /** For the pickers: when this button is the one that opened a popover, the
   *  popover has to hand focus back to it on close. */
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={cx(styles.iconBtn, danger && styles.isDanger, open && styles.isOpen)}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-expanded={expanded}
      title={label}
    >
      <Ic name={icon} />
    </button>
  );
}

/* ============================================================
   SWITCH ROW — the four proposal options
   ============================================================ */

/**
 * A square switch on a square-cornered system: a pill would be the only rounded
 * object on the page. The whole row is the control — a 56px target rather than
 * a 46px knob — and `role="switch"` + `aria-checked` is what makes it a switch
 * to a screen reader rather than a button that happens to look like one.
 *
 * THE NAME IS THE LABEL ALONE. All three lines live inside the button, so
 * without the wiring below the accessible name would be the whole paragraph —
 * and because the effect line flips with the switch, the control's NAME would
 * change on every press and a screen-reader user would hear a different control
 * each time. `aria-labelledby` pins the name to the label span; the spec hint
 * and the live effect line are announced as DESCRIPTION, which is what they are.
 */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  effect,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** What this toggle is doing to the client's copy RIGHT NOW, in the mono
   *  annotation register. Consequence in place: the option says what it changed
   *  without the user scrolling to the sheet to find out. */
  effect: string;
}) {
  const uid = useId();
  const labId = `${uid}-lab`;
  const hintId = `${uid}-hint`;
  const effectId = `${uid}-effect`;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labId}
      aria-describedby={`${hintId} ${effectId}`}
      className={styles.tog}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.togCopy}>
        <span className={styles.togLab} id={labId}>
          {label}
        </span>
        <span className={styles.togHint} id={hintId}>
          {hint}
        </span>
        <span className={styles.togEffect} id={effectId}>
          {effect}
        </span>
      </span>
      <span className={cx(styles.sw, checked && styles.swOn)} aria-hidden="true" />
    </button>
  );
}

/* ============================================================
   NOTES AND EMPTY STATES
   ============================================================ */

/** An empty state — a 1.5px dashed note on the drawing, per the system's
 *  signature element. `kicker` names the state; the body says what to do. */
export function Empty({ kicker, children }: { kicker: string; children: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <b>{kicker}</b>
      {children}
    </div>
  );
}

/** The mono annotation line used under fields and inside sheets. */
export function Ann({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cx(styles.ann, className)}>{children}</p>;
}

/** A sub-block inside a card body: caps label, one teach line, then content. */
export function Sub({
  label,
  teach,
  children,
}: {
  label: string;
  teach?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.sub}>
      <div className={styles.subLab}>{label}</div>
      {teach && <p className={styles.subTeach}>{teach}</p>}
      {children}
    </div>
  );
}
