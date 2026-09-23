"use client";

// Small pieces the desktop roof inventory shares across its sections: the
// sprite icon, the status plate, the drawn stock bar, the supplier picker and
// the write envelope. Styles live in roof-inventory.css under `.jf-rinv`.

import { useState, type CSSProperties, type ReactNode } from "react";
import { BlueprintSelect, type SelectStyles } from "@/components/v3/advanced-ai-blueprint/blueprint-select";
import type { BoardSupplier } from "@/lib/inventoryBoard";
import type { StockRow } from "@/lib/inventory";
import { qty, stockBar, type RowState, type Tone } from "./inventory-model";

/** What every server action resolves to — its own `{ ok, … }` envelope. */
export type ActionResult = { ok: boolean; error?: string } & Record<string, unknown>;
/** Runs one write inside the page's transition, then refreshes from the database. */
export type Run = (work: () => Promise<ActionResult>, done?: (r: ActionResult) => string) => void;

/** The model's tones plus plain ink (a finished proposal). */
export type PlateTone = Tone | "ink";

export function Ic({ id, className }: { id: string; className?: string }) {
  return (
    <svg className={className ? `ic ${className}` : "ic"} aria-hidden="true" focusable="false">
      <use href={`#${id}`} />
    </svg>
  );
}

export function Plate({ tone, children }: { tone: PlateTone; children: ReactNode }) {
  return (
    <span className="ri-plate" data-tone={tone}>
      {children}
    </span>
  );
}

/**
 * Status plates may wrap in the ledger's narrow column. Bind the tail phrase
 * so the break falls before it — "SHORT 20 / FOR SOLD JOBS", never
 * "SHORT 20 FOR / SOLD JOBS". The words are the model's, unchanged.
 */
export function plateWords(text: string): string {
  return text.replace(/ (for sold jobs|if all sell)$/, (m) => " " + m.slice(1).replace(/ /g, " "));
}

/** A signed quantity with a real minus sign. */
export const signed = (n: number) => (n < 0 ? `−${qty(-n)}` : qty(n));

/**
 * The signature: on hand drawn as a track. Reserved is an ink hatch, free is
 * blueprint (amber when under the line), a deficit is a danger hatch running
 * past the shelf, the forecast a dashed box beyond it, the reorder line a tick.
 * `index` staggers the one-time draw-in on first paint.
 */
export function StockBar({ r, st, index }: { r: StockRow; st: RowState; index: number }) {
  const b = stockBar(r, st);
  const seg = (left: number, width: number): CSSProperties => ({ left: `${left}%`, width: `${width}%` });
  return (
    <div className="ri-bar" style={{ "--i": Math.min(index, 24) } as CSSProperties} aria-hidden="true">
      {b.reserved > 0 && <i className="ri-bar-res" style={seg(0, b.reserved)} />}
      {b.free > 0 && <i className="ri-bar-free" data-warn={b.freeWarn ? "" : undefined} style={seg(b.freeLeft, b.free)} />}
      {b.deficit > 0 && <i className="ri-bar-def" style={seg(b.deficitLeft, b.deficit)} />}
      {b.forecast > 0 && <i className="ri-bar-fc" style={seg(b.forecastLeft, b.forecast)} />}
      {b.line != null && <b className="ri-bar-line" style={{ left: `${b.line}%` }} title={`Reorder line: ${qty(r.threshold)} ${r.unit}`} />}
    </div>
  );
}

/** The house drawn dropdown, drawn by this page's stylesheet. */
export const SEL: SelectStyles = {
  bsel: "ri-sel",
  "bsel-btn": "ri-sel-btn",
  "bsel-val": "ri-sel-val",
  "bsel-caret": "ri-sel-caret",
  "bsel-list": "ri-sel-list",
  "bsel-opt": "ri-sel-opt",
};

export const supplierOptions = (suppliers: readonly BoardSupplier[]) => suppliers.map((x) => ({ value: x.id, label: x.name }));

/**
 * The drawn dropdown inside a form: the choice rides in a hidden input so the
 * form reads it by name, exactly like the native select it replaces.
 */
export function SupplierField({ name, suppliers, initial }: { name: string; suppliers: readonly BoardSupplier[]; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  return (
    <>
      <BlueprintSelect value={value} onChange={setValue} options={[{ value: "", label: "—" }, ...supplierOptions(suppliers)]} placeholder="—" ariaLabel="Supplier" styles={SEL} />
      <input type="hidden" name={name} value={value} />
    </>
  );
}
