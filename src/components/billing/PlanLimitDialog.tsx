"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePlanLimitStore } from "@/stores/usePlanLimitStore";
import { LIMIT_DEFS } from "@/lib/planLimits";
import "./plan-limit-dialog.css";

/**
 * Globally-mounted "you've hit your plan limit" dialog. Hand-rolled per the
 * house modal style (no Radix). Opened via reportPlanLimit() from create flows.
 *
 * REDRAWN 2026-09-02 in the blueprint language: ink frame, hard offset, mono
 * kicker, two stamp buttons. The old build leaned on the classic shell's
 * `paper-card` / `shadow-pop` / Button classes, which the blueprint shell does
 * not load — so inside it the dialog rendered as bare text in a white box
 * (owner's screenshot). Mount/unmount rides the same two-flag pattern as the
 * signup page picker so the box has a start state to transition from.
 */
export function PlanLimitDialog() {
  const open = usePlanLimitStore((s) => s.open);
  const resource = usePlanLimitStore((s) => s.resource);
  const close = usePlanLimitStore((s) => s.close);

  const def = resource ? LIMIT_DEFS.find((d) => d.key === resource) : null;
  const label = def?.label.toLowerCase() ?? null;
  const absolute = def?.scope === "absolute";

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
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!mounted || typeof document === "undefined") return null;

  /* PORTALLED to <body>: the shell's content column is its own stacking
     context under the topbar, so a fixed overlay rendered inside it left the
     topbar bright above the scrim (owner's screenshot, 2026-09-02). */
  return createPortal(
    <div
      className={"jf-limit" + (on ? " is-on" : "")}
      role="dialog"
      aria-modal="true"
      aria-labelledby="jf-limit-title"
    >
      <div className="jf-limit-scrim" onClick={close} />
      <div className="jf-limit-box">
        <div className="jf-limit-head">
          <span className="jf-limit-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="4" y="11" width="16" height="10" rx="1.5" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </span>
          <div>
            <div className="jf-limit-kick">Plan limit</div>
            <h2 className="jf-limit-h" id="jf-limit-title">
              {label ? `No ${label} left.` : "You've reached your plan limit."}
            </h2>
          </div>
        </div>
        <p className="jf-limit-p">
          {label ? (
            <>
              You&rsquo;ve used all the <b>{label}</b> included in your plan.{" "}
            </>
          ) : (
            <>You&rsquo;ve hit a limit on your current plan. </>
          )}
          {absolute
            ? "Upgrade to add more."
            : "Upgrade to keep going now, or wait until the limit resets next cycle."}
        </p>
        {def ? (
          <div className="jf-limit-meter">
            <span>{def.label}</span>
            <span>{absolute ? "Seats full" : "0 left this cycle"}</span>
          </div>
        ) : null}
        <div className="jf-limit-row">
          <button type="button" className="jf-limit-btn" onClick={close}>
            Not now
          </button>
          <Link
            href={"/dashboard/subscription" as never}
            className="jf-limit-btn primary"
            onClick={close}
          >
            Upgrade plan
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  , document.body);
}
