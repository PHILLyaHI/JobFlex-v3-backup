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

export interface EditableLine extends EstimateLine {
  basis?: Basis;
}

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-US");
const BASIS_TONE: Record<Basis, string> = { measured: "ok", estimated: "wait", entered: "" };

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
        if (v.trim() !== "" && Number.isFinite(n) && n >= 0) onCommit(n);
      }}
      onBlur={() => {
        if (txt.trim() === "" || !Number.isFinite(Number(txt))) setTxt(String(value));
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
    <div className="bo-sec">
      <div className="bo-head">
        <span className="kpi-lbl">{title}</span>
        <span className="bo-sum">{money(sum)}</span>
      </div>
      <table className="bo-table bo-table--edit">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th>Unit</th>
            <th className="num">Unit $</th>
            <th className="num">Total</th>
            <th className="bo-basis-th">Basis</th>
            <th className="bo-x-th" aria-label="Remove" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <input className="bo-in" value={r.name} disabled={disabled} placeholder="Item" aria-label="Item" onChange={(e) => patch(r.id, { name: e.target.value })} />
              </td>
              <td className="num">
                <NumCell value={r.quantity} disabled={disabled} ariaLabel={`${r.name || "line"} quantity`} onCommit={(n) => patch(r.id, { quantity: n })} />
              </td>
              <td>
                <span className="bp-sel bo-sel">
                  <select className="bp-sel-in bo-in" value={(PKG_UNITS as readonly string[]).includes(r.unit ?? "") ? r.unit : ""} disabled={disabled} aria-label="Unit" onChange={(e) => patch(r.id, { unit: e.target.value || undefined })}>
                    {!(PKG_UNITS as readonly string[]).includes(r.unit ?? "") && <option value="">{r.unit || "—"}</option>}
                    {PKG_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </span>
              </td>
              <td className="num">
                <NumCell value={r.unitPrice} disabled={disabled} ariaLabel={`${r.name || "line"} unit price`} onCommit={(n) => patch(r.id, { unitPrice: n })} />
              </td>
              <td className="num">
                <b>{money(r.quantity * r.unitPrice)}</b>
              </td>
              <td className="bo-basis">{r.basis && <span className={"chip " + BASIS_TONE[r.basis]}>{r.basis}</span>}</td>
              <td className="bo-x">
                <button type="button" className="bo-x-btn" disabled={disabled} title="Remove line" aria-label={`Remove ${r.name || "line"}`} onClick={() => remove(r.id)}>
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bo-add">
        <button type="button" className="btn btn-ghost btn--sm" disabled={disabled} onClick={add}>
          + {addLabel}
        </button>
      </div>
      <style jsx global>{`
        .jf-blueprint .content .bo-table--edit td {
          padding: 5px 10px;
        }
        .jf-blueprint .content .bo-in {
          width: 100%;
          min-width: 0;
          height: 32px;
          padding: 0 8px;
          border: 1.5px solid var(--hair-soft);
          border-radius: var(--radius);
          background: #fff;
          font-family: var(--font);
          font-size: 13px;
          color: var(--ink);
        }
        .jf-blueprint .content .bo-in.num {
          text-align: right;
          font-variant-numeric: tabular-nums;
          max-width: 96px;
        }
        .jf-blueprint .content .bo-in:hover {
          border-color: var(--muted);
        }
        .jf-blueprint .content .bo-in:focus {
          outline: none;
          border-color: var(--ink);
          background: #fff;
        }
        .jf-blueprint .content .bo-sel {
          display: block;
          min-width: 108px;
        }
        .jf-blueprint .content .bo-sel .bo-in {
          height: 32px;
          padding-right: 26px;
        }
        .jf-blueprint .content .bo-basis-th,
        .jf-blueprint .content .bo-basis {
          width: 92px;
        }
        .jf-blueprint .content .bo-x-th,
        .jf-blueprint .content .bo-x {
          width: 36px;
          text-align: center;
        }
        .jf-blueprint .content .bo-x-btn {
          width: 28px;
          height: 28px;
          border: 1.5px solid transparent;
          border-radius: var(--radius);
          background: transparent;
          color: var(--muted);
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
        }
        .jf-blueprint .content .bo-x-btn:hover {
          border-color: var(--hair-soft);
          color: var(--ink);
          background: #fff;
        }
        .jf-blueprint .content .bo-add {
          padding: 8px 10px;
          border-top: 1.5px solid var(--hair-soft);
        }
        @media (max-width: 768px) {
          .jf-blueprint .content .bo-basis-th,
          .jf-blueprint .content .bo-basis {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
