"use client";

// What the Inventory page's parts share: the class joiner, the handheld
// switch, the sheet and the empty state (owner, 2026-09-29).

import { useSyncExternalStore, type ReactNode } from "react";
import { X } from "lucide-react";
import { OverlayPortal } from "@/components/v3/blueprint-shell/overlay-layer";
import styles from "./inventory.module.css";

export const cx = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).map((n) => styles[n as string] ?? n).join(" ");

const HANDHELD = "(max-width: 768px)";
const subscribe = (cb: () => void) => { const q = window.matchMedia(HANDHELD); q.addEventListener("change", cb); return () => q.removeEventListener("change", cb); };
export const useHandheld = () => useSyncExternalStore(subscribe, () => window.matchMedia(HANDHELD).matches, () => false);

/**
 * The page's sheet: hand-rolled, InboxSheet's style, portalled into the
 * shell's overlay layer — drawn inside `.content` the scrim painted under the
 * sidebar, the topbar and the support button. `.inv-layer` re-roots the module.
 */
export function Sheet({ id = "inv-sheet-title", kicker, title, onClose, footer, wide, children }: { id?: string; kicker: string; title: string; onClose: () => void; footer?: ReactNode; wide?: boolean; children: ReactNode }) {
  return (
    <OverlayPortal>
      <div className="inv-layer">
        <div className={cx("sh-bg")} onClick={onClose} aria-hidden="true" />
        <aside className={cx("sh", wide && "sh-wide")} role="dialog" aria-modal="true" aria-labelledby={id}>
          <div className={cx("sh-h")}>
            <div><div className={cx("sh-k")}>{kicker}</div><h2 className={cx("sh-t")} id={id}>{title}</h2></div>
            <button type="button" className={cx("sh-x")} onClick={onClose} aria-label="Close"><X size={18} /></button>
          </div>
          <div className={cx("sh-b")}>{children}</div>
          {footer && <div className={cx("sh-f")}>{footer}</div>}
        </aside>
      </div>
    </OverlayPortal>
  );
}

/** The Add expense form's select (.pinput, the Proposals / Financials sheets), one choice per row, a counter after the label. */
export function Picker<T extends string>({ label, value, items, onChange }: { label: string; value: T; items: Array<{ id: T; label: string; n?: number }>; onChange: (id: T) => void }) {
  return (
    <select className="pinput" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {items.map((it) => <option key={it.id} value={it.id}>{it.label}{it.n !== undefined ? ` · ${it.n}` : ""}</option>)}
    </select>
  );
}

/** One dashed frame, one phrase, one button — the same everywhere on the page. */
export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return <div className={cx("empty")}><span>{text}</span>{action}</div>;
}

/** The Proposals .pstatus tones (proposals.module.css) for the stock's three states; neutral is the plain pill. */
export const STAMP_TONE: Record<"danger" | "warning" | "success" | "neutral", string> = { danger: "pstatus--declined", warning: "pstatus--expired", success: "pstatus--accepted", neutral: "" };
