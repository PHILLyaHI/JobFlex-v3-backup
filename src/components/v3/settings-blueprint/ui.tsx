"use client";

// Settings blueprint — shared UI primitives.
//
// Every pane (account / payments / billing / integrations / notifications)
// codes against exactly these seven exports, so the API cannot drift.
//
// Class names are plain strings, never CSS-module identifiers: the settings
// stylesheet declares every rule as `.bp :global(.content SEL)`, so the markup
// here must carry the donor's literal class names (`fld`, `fin`, `tg`, `cb`,
// `mono-box`, `copy`, `sactions`, `saved`, `mask`, `modal`, …).
//
// Owner fixes baked in here:
//   F10 — `Sel` is the custom dropdown that replaces every native <select>.
//   F12 — `Toggle` renders NO child svg; the .tg colour states carry the state.
//   F11 — `Modal` is the hand-rolled animated pop-up form (no Radix).
//
// Icons come from the shared shell sprite plus this page's local sprite.tsx.

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

/* ─────────────────────────────── Field ─────────────────────────────── */

export interface FieldProps {
  /** Uppercased by CSS; pass it in sentence case exactly as the donor writes it. */
  label: string;
  /** Uncontrolled initial value (donor `value="…"`). */
  value?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** `<label class="fld"><span>LABEL</span><input class="fin" …></label>` */
export function Field({ label, value, placeholder, disabled }: FieldProps) {
  return (
    <label className="fld">
      <span>{label}</span>
      <input
        className="fin"
        defaultValue={value}
        placeholder={placeholder}
        disabled={disabled}
      />
    </label>
  );
}

/* ──────────────────────────────── Sel ──────────────────────────────── */

export interface SelProps {
  /** When given, the control is wrapped in `<div class="fld"><span>LABEL</span>…</div>`. */
  label?: string;
  /** Currently selected option. `Sel` is fully controlled — the parent owns this. */
  value: string;
  options: readonly string[];
  /**
   * Required: `Sel` keeps no internal copy of `value`, so a dropdown without an
   * `onChange` would be inert. Mirroring the prop into local state instead would
   * mean a setState-in-effect cascade (`react-hooks/set-state-in-effect`).
   */
  onChange: (next: string) => void;
}

/**
 * Custom styled dropdown — the F10 replacement for every native `<select class="fin">`.
 * Closes on outside pointerdown and on Escape; full keyboard support.
 */
export function Sel({ label, value, options, onChange }: SelProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // The selected option is read straight off the `value` prop. Every pane already
  // holds it in `useState`, so a local mirror would only add a render cascade.
  const current = value;

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const wrap = wrapRef.current;
      if (wrap && !wrap.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Escape closes and returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Move focus into the menu, onto the selected option.
  useEffect(() => {
    if (!open) return;
    const menu = menuRef.current;
    if (!menu) return;
    const target =
      menu.querySelector<HTMLButtonElement>(".is-sel") ??
      menu.querySelector<HTMLButtonElement>(".sel-opt");
    target?.focus();
  }, [open]);

  const pick = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      btnRef.current?.focus();
    },
    [onChange],
  );

  const onBtnKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const menu = menuRef.current;
    if (!menu) return;
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>(".sel-opt"));
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = items[(at + step + items.length) % items.length];
    next?.focus();
  };

  const control = (
    <div className={open ? "sel on" : "sel"} ref={wrapRef}>
      <button
        className="sel-btn"
        type="button"
        ref={btnRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onBtnKeyDown}
      >
        <span className="sel-val">{current}</span>
        <svg className="ic sel-chev">
          <use href="#i-chev" />
        </svg>
      </button>
      <div className="sel-menu" role="listbox" ref={menuRef} onKeyDown={onMenuKeyDown}>
        {options.map((o) => (
          <button
            key={o}
            className={o === current ? "sel-opt is-sel" : "sel-opt"}
            type="button"
            role="option"
            aria-selected={o === current}
            onClick={() => pick(o)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );

  if (label === undefined) return control;

  return (
    <div className="fld">
      <span>{label}</span>
      {control}
    </div>
  );
}

/* ────────────────────────────── Toggle ─────────────────────────────── */

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}

/**
 * F12: no child svg. The donor's `.tg` rules (green on / red off) carry the
 * whole state read-out; the check/cross icons are gone for good.
 */
export function Toggle({ checked, onChange, ariaLabel }: ToggleProps) {
  return (
    <button
      className="tg"
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
    />
  );
}

/* ──────────────────────────────── Cbx ──────────────────────────────── */

export interface CbxProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  ariaLabel?: string;
}

/**
 * Notifications-matrix checkbox. Keeps its inline check mark exactly as the
 * donor writes it (line 2109) — it is a checkbox, not a toggle.
 */
export function Cbx({ checked, onChange, ariaLabel }: CbxProps) {
  return (
    <button
      className="cb"
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
    >
      <svg className="cb-ic" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </button>
  );
}

/* ────────────────────────────── CopyBox ────────────────────────────── */

export interface CopyBoxProps {
  value: string;
}

/** `.mono-box` + `.copy`; click copies and flashes "Copied" for 1600ms. */
export function CopyBox({ value }: CopyBoxProps) {
  const [done, setDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(value).catch(() => {
      /* clipboard blocked (insecure origin / denied permission) — still flash */
    });
    setDone(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  }, [value]);

  return (
    <div className="mono-box">
      <code>{value}</code>
      <button className={done ? "copy done" : "copy"} type="button" onClick={copy}>
        {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/* ────────────────────────────── SaveBar ────────────────────────────── */

export interface SaveBarProps {
  /** Extra buttons rendered between Save changes and the Saved tag. */
  extra?: ReactNode;
}

/** `.sactions` footer; click shows the `.saved.on` tag for 2200ms. */
export function SaveBar({ extra }: SaveBarProps) {
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = useCallback(() => {
    setSaved(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setSaved(false), 2200);
  }, []);

  return (
    <div className="sactions">
      <button className="btn btn-primary" type="button" onClick={save}>
        <svg className="ic">
          <use href="#i-check" />
        </svg>
        Save changes
      </button>
      {extra}
      <span className={saved ? "saved on" : "saved"}>
        <svg className="ic" style={{ width: "13px", height: "13px" }}>
          <use href="#i-check" />
        </svg>
        Saved
      </span>
    </div>
  );
}

/* ─────────────────────────────── Modal ─────────────────────────────── */

export interface ModalProps {
  title: string;
  sub?: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}

/**
 * F11: hand-rolled animated pop-up form. No Radix, no portal — it renders
 * inside `.content` so the module's `.bp :global(.content .mask)` scoping and
 * the settings_maskIn / settings_modalIn keyframes apply.
 * Closes on Escape and on mask click, locks body scroll, takes focus on open.
 */
export function Modal({ title, sub, onClose, children, footer }: ModalProps) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  return (
    <div
      className="mask"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={boxRef}
      >
        <div className="modal-h">
          <div>
            <div className="sc-t">{title}</div>
            {sub ? <div className="sc-s">{sub}</div> : null}
          </div>
          <button className="modal-x" type="button" aria-label="Close" onClick={onClose}>
            <svg className="ic">
              <use href="#i-x" />
            </svg>
          </button>
        </div>
        <div className="modal-b">{children}</div>
        <div className="modal-f">{footer}</div>
      </div>
    </div>
  );
}
