"use client";

/* THE BLUEPRINT SHEET — the dialog the Financials page's own "Add an expense"
 * is drawn as, made into a component so the two sheets that share that page
 * (the invoice sheet, the change-order sheet) look like it instead of like
 * the older Tailwind side panel.
 *
 * Desktop: a centred box — ink border, offset shadow, the title in caps at a
 * heavy weight, a mono kicker above it, a footer band under a 1.5px rule.
 * Phone (≤768px): the same box as a bottom sheet with a grab handle, the way
 * the handheld Financials draws its own forms.
 *
 * It renders through a PORTAL to <body>, on purpose and for two reasons. The
 * blueprint pages reset margin, padding, borders and backgrounds on everything
 * under `.content` (financials.module.css: `.content *`, `.content button`),
 * which is what stripped the invoice sheet to bare <select>s and text buttons
 * when it rendered in place (owner, 2026-09-19). And its own stylesheet is
 * global and prefixed `bps-`, with the blueprint tokens restated on the root,
 * so it draws the same on the classic dashboard, the blueprint pages and the
 * handheld frame — none of which agree on which tokens are set.
 *
 * Chrome only. What goes inside (fields, buttons, logic) belongs to the caller.
 */

import * as React from "react";
import { createPortal } from "react-dom";
import "./blueprint-sheet.css";

interface BlueprintSheetProps {
  open: boolean;
  onClose: () => void;
  /** Caps, heavy — "SEND AN INVOICE". */
  title?: string;
  /** The muted line under the title — the contract, the number, the one-line intent. */
  description?: string;
  children?: React.ReactNode;
  /** Sits in the footer band; a row of buttons, usually. */
  footer?: React.ReactNode;
  /** Desktop box width. The phone ignores it — the sheet is the screen's width. */
  width?: string;
  /** Extra class on the box, for a caller that needs one more hook. */
  className?: string;
}

export function BlueprintSheet({ open, onClose, title, description, children, footer, width = "min(520px, 100%)", className }: BlueprintSheetProps) {
  // false on the server and during hydration, true once the client is up —
  // createPortal needs a document, and the sheet is closed until then anyway.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under an open sheet — on a phone the
    // bottom sheet would otherwise drift with the page.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="bps" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bps-bg" onClick={onClose} />
      <div className={["bps-box", className].filter(Boolean).join(" ")} style={{ ["--bps-w" as string]: width } as React.CSSProperties}>
        <div className="bps-grab" aria-hidden="true" />
        <div className="bps-head">
          <div className="bps-head-txt">
            {title ? <h2 className="bps-title">{title}</h2> : null}
            {description ? <div className="bps-sub">{description}</div> : null}
          </div>
          <button className="bps-x" type="button" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="bps-body">{children}</div>
        {footer ? <div className="bps-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
