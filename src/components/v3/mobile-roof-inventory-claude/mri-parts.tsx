"use client";

// Small presentational parts of the handheld roofing inventory: the icon, the
// status plate, the drawn stock bar, the legend, the feedback strip and the
// bottom-sheet frame. No data reads and no writes live here — the page owns
// both — so each part is a pure function of its props.

import type { ReactNode, SelectHTMLAttributes } from "react";
import { useSheetDrag } from "@/components/v3/mobile-shell/use-sheet-drag";
import type { StockBar, Tone } from "@/components/v3/roof-inventory-claude/inventory-model";

/**
 * The shared model names desktop sprite ids. Two of them are not in the
 * handheld sprite (mobile-shell/sprite.tsx, which this page may not edit), so
 * they are drawn with the nearest symbol the handheld sprite does carry
 * rather than as an empty box. `i-hardhat` is on the construction-cliché list
 * and is never drawn here even if the model asks for it.
 */
const SPRITE_STAND_IN: Record<string, string> = {
  "i-box": "i-building",
  "i-hardhat": "i-jobs",
};

export function Icon({ id, className }: { id: string; className?: string }) {
  const use = SPRITE_STAND_IN[id] ?? id;
  return (
    <svg className={`mri-ic${className ? ` ${className}` : ""}`} aria-hidden="true" focusable="false">
      <use href={`#${use}`} />
    </svg>
  );
}

/** A status plate: 1.5px base-tone border, soft fill, caps. Tone is state only. */
export function Plate({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`mri-plate t-${tone}`}>{children}</span>;
}

/**
 * The stock bar as a drawn track. Every segment is a percentage of one scale
 * (the model's `stockBar`): reserved is ink hatch, free is blueprint solid
 * (amber when the row is under its line), a deficit runs past the shelf in
 * danger hatch, the forecast is a dashed outline, the reorder line an ink tick.
 */
export function StockTrack({ bar, big = false }: { bar: StockBar; big?: boolean }) {
  return (
    <span className={`mri-bar${big ? " is-big" : ""}`} aria-hidden="true">
      {bar.reserved > 0 && <i className="b-res" style={{ left: 0, width: `${bar.reserved}%` }} />}
      {bar.free > 0 && <i className={`b-free${bar.freeWarn ? " is-warn" : ""}`} style={{ left: `${bar.freeLeft}%`, width: `${bar.free}%` }} />}
      {bar.deficit > 0 && <i className="b-def" style={{ left: `${bar.deficitLeft}%`, width: `${bar.deficit}%` }} />}
      {bar.forecast > 0 && <i className="b-fc" style={{ left: `${bar.forecastLeft}%`, width: `${bar.forecast}%` }} />}
      {bar.line != null && <b className="b-line" style={{ left: `${bar.line}%` }} />}
    </span>
  );
}

/** The one legend, drawn once above the list with the same swatches the bar uses. */
export function Legend() {
  return (
    <ul className="mri-legend" aria-label="How to read the stock bar">
      <li>
        <i className="lg-res" aria-hidden="true" />
        reserved · sold jobs
      </li>
      <li>
        <i className="lg-free" aria-hidden="true" />
        free
      </li>
      <li>
        <i className="lg-fc" aria-hidden="true" />
        forecast · open proposals
      </li>
      <li>
        <i className="lg-line" aria-hidden="true" />
        reorder line
      </li>
    </ul>
  );
}

/**
 * The feedback strip. An error is `role="alert"` and stays until dismissed; a
 * receipt is `role="status"`. While a write is on the wire the strip says so,
 * because on a phone the pressed button is often scrolled away by then.
 */
export function Flash({ error, note, pending, onDismiss, inSheet = false }: { error: string | null; note: string | null; pending: boolean; onDismiss: () => void; inSheet?: boolean }) {
  if (error) {
    return (
      <div className={`mri-flash is-bad${inSheet ? " in-sheet" : ""}`} role="alert">
        <span className="mri-flash-t">{error}</span>
        <button type="button" className="mri-flash-x" aria-label="Dismiss" onClick={onDismiss}>
          <Icon id="i-x" />
        </button>
      </div>
    );
  }
  if (pending) {
    return (
      <div className={`mri-flash is-busy${inSheet ? " in-sheet" : ""}`} role="status">
        <span className="mri-flash-t">Saving…</span>
      </div>
    );
  }
  if (note) {
    return (
      <div className={`mri-flash is-ok${inSheet ? " in-sheet" : ""}`} role="status">
        <Icon id="i-check" className="mri-flash-ic" />
        <span className="mri-flash-t">{note}</span>
        <button type="button" className="mri-flash-x" aria-label="Dismiss" onClick={onDismiss}>
          <Icon id="i-x" />
        </button>
      </div>
    );
  }
  return null;
}

/**
 * The bottom-sheet frame, hand-rolled. Always mounted: it slides up on `open`
 * and slides back down when `open` drops — the exit is the same transition
 * run in reverse, never a `display: none` cut. Swipe-down-to-dismiss comes
 * from the fleet's shared hook. The page owns the scroll lock, Escape, the
 * focus move and its return, because one scrim serves all three sheets.
 */
export function Sheet({ id, open, onClose, title, sub, children }: { id: string; open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode }) {
  const drag = useSheetDrag(open, onClose);
  const labelId = `${id}-t`;
  return (
    <div id={id} className={`mri-sheet${open ? " on" : ""}`} role="dialog" aria-modal="true" aria-labelledby={labelId} aria-hidden={open ? undefined : true} {...drag.sheetProps}>
      <div className="mri-grab" {...drag.handleProps} />
      <div className="mri-sheet-h" {...drag.handleProps}>
        <div className="mri-sheet-hl">
          <h2 className="mri-sheet-t" id={labelId}>
            {title}
          </h2>
          {sub}
        </div>
        <button type="button" className="mri-x" aria-label="Close" onClick={onClose} data-sheet-close>
          <Icon id="i-x" />
        </button>
      </div>
      <div className="mri-sheet-b">{children}</div>
    </div>
  );
}

/** A labelled field. The label is the mono annotation; the control is 48px. */
export function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={`mri-fld${wide ? " is-wide" : ""}`}>
      <span className="mri-lbl">{label}</span>
      {children}
    </label>
  );
}

/** A native select in the drawing's frame: the wrapper draws the caret. */
export function Select({ children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="mri-sel">
      <select className="mri-sel-in" {...rest}>
        {children}
      </select>
      <Icon id="i-chev" className="mri-sel-ic" />
    </span>
  );
}
