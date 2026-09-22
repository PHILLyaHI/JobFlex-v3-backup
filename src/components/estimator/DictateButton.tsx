"use client";

// The press-and-speak button beside a brief field: the microphone, the
// state it is in, and one line when the microphone could not be used. Hidden
// where the browser cannot listen (hooks/useDictation). Every class comes
// from the surface that mounts it, so the desktop console and the handheld
// page each draw it in their own kit.

import type { ReactNode } from "react";
import { useDictation } from "@/hooks/useDictation";

/** The microphone drawn inline — for pages with no sprite of their own (the homeowner portals, 2026-09-21). */
export function MicIcon({ className = "ic" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </svg>
  );
}

/**
 * Put dictated text into an UNCONTROLLED textarea the way typing would: through
 * the element's own value setter and an input event, so React's onChange runs
 * and whatever the field does on typing (state, a category guess) still happens.
 */
export function setTextareaValue(el: HTMLTextAreaElement | null, next: string): void {
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function DictateButton({
  id,
  value,
  onChange,
  wrapClassName,
  buttonClassName,
  onClassName,
  noteClassName,
  iconId = "i-mic",
  iconClassName = "ic",
  icon,
  label = "Speak the brief",
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  wrapClassName?: string;
  buttonClassName?: string;
  /** Added to the button while it listens. */
  onClassName?: string;
  noteClassName?: string;
  iconId?: string;
  iconClassName?: string;
  /** An inline icon instead of the sprite symbol. */
  icon?: ReactNode;
  /** The resting label; while listening the button always says so. */
  label?: string;
}) {
  const d = useDictation(value, onChange);
  if (!d.supported) return null;
  return (
    <div className={wrapClassName} data-dictate={d.listening ? "on" : "off"}>
      <button
        type="button"
        id={id}
        className={[buttonClassName, d.listening ? onClassName : ""].filter(Boolean).join(" ")}
        aria-pressed={d.listening}
        title={d.listening ? "Stop listening" : "Press and speak — the words type themselves"}
        onClick={d.toggle}
      >
        {icon ?? (
          <svg className={iconClassName} aria-hidden="true">
            <use href={`#${iconId}`} />
          </svg>
        )}
        <span>{d.listening ? "Listening… press to stop" : label}</span>
      </button>
      {d.error ? (
        <span className={noteClassName} role="alert">
          {d.error}
        </span>
      ) : null}
    </div>
  );
}
