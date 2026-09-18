"use client";

// The estimate's two tables, EDITABLE. Same register as the read-only
// EstimateTable the report showed until 2026-09-12 (bo-sec / bo-head /
// bo-table), with quiet fields in the cells: the contractor adjusts a quantity
// or a price here, before converting, instead of on the proposal afterwards.
// A line carries the basis of its quantity (measured / estimated / entered)
// when the package builder made it; AI lines have none.

import * as React from "react";
import { nanoid } from "nanoid";
import type { EstimateLine } from "@/components/estimator/EstimatorBreakdown";
import { PKG_UNITS, type Basis } from "@/lib/roofPackage/catalog";
import "./estimate-lines-table.css";

export interface EditableLine extends EstimateLine {
  basis?: Basis;
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

/** A number field that tolerates half-typed input ("12.") without snapping back. */
function NumCell({ value, onCommit, disabled, ariaLabel }: { value: number; onCommit: (n: number) => void; disabled?: boolean; ariaLabel: string }) {
  const [txt, setTxt] = React.useState(String(value));
  // The prop moved away from what is typed (a rebuilt package): adopt it.
  // Done during render, not in an effect.
  const [seen, setSeen] = React.useState(value);
  if (value !== seen) {
    setSeen(value);
    if (Number(txt) !== value) setTxt(String(value));
  }
  return (
    <input
      className="bo-in num"
      inputMode="decimal"
      value={txt}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        const v = e.target.value;
        setTxt(v);
        const n = Number(v.replace(/,/g, ""));
        if (v.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 1e9) onCommit(n);
      }}
      onBlur={() => {
        setTxt(String(value));
      }}
    />
  );
}

export function EstimateLinesTable({
  title,
  rows,
  onChange,
  disabled,
  addLabel = "Add line",
}: {
  title: string;
  rows: EditableLine[];
  onChange: (rows: EditableLine[]) => void;
  disabled?: boolean;
  addLabel?: string;
}) {
  const sum = rows.reduce((a, r) => a + r.quantity * r.unitPrice, 0);
  const patch = (id: string, p: Partial<EditableLine>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const remove = (id: string) => onChange(rows.filter((r) => r.id !== id));
  const add = () => onChange([...rows, { id: nanoid(6), name: "", quantity: 1, unitPrice: 0, unit: "each", basis: "entered" }]);
  return (
    <div className="bo-sec bo-edit">
      <div className="bo-head">
        {/* The focus target after "Review N lines" fills the tables (data-lines-heading). */}
        <span className="kpi-lbl" tabIndex={-1} data-lines-heading>{title}</span>
        <span className="bo-sum">{money(sum)}</span>
      </div>
      <table className="bo-table bo-table--edit">
        <thead>
          <tr>
            <th className="bo-name">Item</th>
            <th className="num bo-qty">Qty</th>
            <th className="bo-unit">Unit</th>
            <th className="num bo-price">Rate $</th>
            <th className="num bo-line-total">Total</th>
            <th className="bo-x-th" aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="bo-name">
                <input className="bo-in" value={r.name} disabled={disabled} placeholder="Item" aria-label={`${title} item`} title={r.name} onChange={(e) => patch(r.id, { name: e.target.value })} />
              </td>
              <td className="num bo-qty" data-label="Quantity">
                <NumCell value={r.quantity} disabled={disabled} ariaLabel={`${r.name || "line"} quantity`} onCommit={(n) => patch(r.id, { quantity: n, basis: "entered" })} />
              </td>
              <td className="bo-unit" data-label="Unit">
                <span className="bp-sel bo-sel">
                  <select className="bp-sel-in bo-in" value={(PKG_UNITS as readonly string[]).includes(r.unit ?? "") ? r.unit : ""} disabled={disabled} aria-label={`${r.name || "line"} unit`} onChange={(e) => patch(r.id, { unit: e.target.value || undefined })}>
                    {!(PKG_UNITS as readonly string[]).includes(r.unit ?? "") && <option value="">{r.unit || "—"}</option>}
                    {PKG_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </span>
              </td>
              <td className="num bo-price" data-label="Rate $">
                <NumCell value={r.unitPrice} disabled={disabled} ariaLabel={`${r.name || "line"} unit price`} onCommit={(n) => patch(r.id, { unitPrice: n })} />
              </td>
              <td className="num bo-line-total" data-label="Total">
                <b>{money(r.quantity * r.unitPrice)}</b>
              </td>
              <td className="bo-x">
                <button type="button" className="bo-x-btn" disabled={disabled} title="Remove line" aria-label={`Remove ${r.name || "line"}`} onClick={() => remove(r.id)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="bo-empty">No {title.toLowerCase()} yet — add a line, or build the package above.</p>}
      <div className="bo-add">
        <button type="button" className="btn btn-ghost btn--sm" disabled={disabled} onClick={add}>
          + {addLabel}
        </button>
      </div>
      {rows.some((r) => r.basis) && (
        <details className="bo-sources">
          <summary>Quantity sources</summary>
          <dl>
            {rows.filter((r) => r.basis).map((r) => (
              <div key={r.id}><dt>{r.name || "Untitled item"}</dt><dd>{r.basis}</dd></div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
