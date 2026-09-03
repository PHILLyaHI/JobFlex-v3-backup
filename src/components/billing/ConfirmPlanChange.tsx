"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import "./confirm-plan-change.css";

/**
 * "Are you sure?" for a plan change — hand-rolled, blueprint-drawn, shared by
 * the subscription page and /dashboard/upgrade. Mounted only while open; the
 * `is-on` class lands a frame after mount so the box has a start state to
 * transition from (same two-flag pattern as every dialog in this fleet).
 */
export function ConfirmPlanChange({
  open,
  kicker = "Change plan",
  title,
  body,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  kicker?: string;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = React.useState(false);
  const [on, setOn] = React.useState(false);
  const exit = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- mount/unmount is driven by
     `open`; the second flag lands a frame later so the box has a start state */
  React.useEffect(() => {
    if (open) {
      if (exit.current) {
        clearTimeout(exit.current);
        exit.current = null;
      }
      setMounted(true);
      const id = requestAnimationFrame(() => setOn(true));
      return () => cancelAnimationFrame(id);
    }
    setOn(false);
    exit.current = setTimeout(() => {
      setMounted(false);
      exit.current = null;
    }, 220);
    return () => {
      if (exit.current) clearTimeout(exit.current);
    };
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!mounted || typeof document === "undefined") return null;

  /* PORTALLED to <body>: the shell's content column is its own stacking
     context under the topbar, so a fixed overlay rendered inside it left the
     topbar bright above the scrim (owner's screenshot, 2026-09-02). */
  return createPortal(
    <div
      className={"jf-confirm" + (on ? " is-on" : "")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="jf-confirm-title"
    >
      <div className="jf-confirm-scrim" onClick={() => !busy && onCancel()} />
      <div className="jf-confirm-box">
        <div className="jf-confirm-kick">{kicker}</div>
        <h2 className="jf-confirm-h" id="jf-confirm-title">
          {title}
        </h2>
        <p className="jf-confirm-p">{body}</p>
        <div className="jf-confirm-row">
          <button type="button" className="jf-confirm-btn" disabled={busy} onClick={onCancel}>
            Keep my plan
          </button>
          <button
            type="button"
            className="jf-confirm-btn primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  , document.body);
}
