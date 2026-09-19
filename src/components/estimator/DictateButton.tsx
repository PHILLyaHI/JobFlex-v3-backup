"use client";

// The press-and-speak button beside a brief field: the microphone, the
// state it is in, and one line when the microphone could not be used. Hidden
// where the browser cannot listen (hooks/useDictation). Every class comes
// from the surface that mounts it, so the desktop console and the handheld
// page each draw it in their own kit.

import { useDictation } from "@/hooks/useDictation";

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
        <svg className={iconClassName} aria-hidden="true">
          <use href={`#${iconId}`} />
        </svg>
        <span>{d.listening ? "Listening… press to stop" : "Speak the brief"}</span>
      </button>
      {d.error ? (
        <span className={noteClassName} role="alert">
          {d.error}
        </span>
      ) : null}
    </div>
  );
}
