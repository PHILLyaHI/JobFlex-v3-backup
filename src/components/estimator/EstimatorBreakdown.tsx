"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface EstimateLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  // Live-pricing product metadata (materials only) — carried through so it
  // survives into the converted proposal's LineItems / Materials Request view.
  store?: string;
  productUrl?: string;
  imageUrl?: string;
  dimensions?: string;
  // The AI's sizing rationale (waste factor + package rounding), shown inline.
  notes?: string;
}

interface BreakdownProps {
  title: string;
  subtitle: string;
  rows: EstimateLine[];
  onChange: (rows: EstimateLine[]) => void;
}

// Borderless register — quiet fields with a sage focus ring, divided by
// hairlines. No per-row card box (and no boxes-inside-a-box).
const FIELD =
  "w-full rounded-[var(--r-sm)] bg-transparent px-2.5 py-1.5 text-[14px] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-faint)] hover:bg-black/[0.02] focus:bg-white/70 focus:shadow-[0_0_0_2px_rgba(31,122,82,0.18)]";
const NUM_FIELD = cn(
  FIELD,
  "text-right tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

// Guard against NaN (cleared field or transient invalid entry) so it never
// poisons row/card totals ("$NaN") or a saved estimate.
const safeNum = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function EstimatorBreakdown({ title, subtitle, rows, onChange }: BreakdownProps) {
  function update(id: string, patch: Partial<EstimateLine>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }
  function add() {
    onChange([...rows, { id: nanoid(6), name: "", quantity: 1, unitPrice: 0, unit: "unit" }]);
  }
  const total = rows.reduce((a, r) => a + r.quantity * r.unitPrice, 0);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardSubtitle>{subtitle}</CardSubtitle>
        </div>
        <div className="stat-numeric text-[22px] leading-none">{money(total)}</div>
      </CardHeader>

      <div className="grid grid-cols-12 gap-2 px-2.5 pb-1.5">
        <div className="quiet-caps !mb-0 col-span-6">Item</div>
        <div className="quiet-caps !mb-0 col-span-2 text-right">Qty</div>
        <div className="quiet-caps !mb-0 col-span-2 text-right">Unit $</div>
        <div className="quiet-caps !mb-0 col-span-2 text-right">Total</div>
      </div>

      <div className="divide-y divide-[color:var(--ink-line)]">
        {rows.map((r) => {
          // The product's size / sell-unit — the one thing that makes "Unit $"
          // read as "price per this". Kept clear; the waste math is demoted.
          const size = r.dimensions?.trim() || r.unit?.trim() || "";
          return (
            <div key={r.id} className="grid grid-cols-12 gap-2 items-start py-2">
              <div className="col-span-6 min-w-0">
                <input
                  className={FIELD}
                  value={r.name}
                  onChange={(e) => update(r.id, { name: e.target.value })}
                  placeholder="Line item"
                />
                {(size || r.notes) && (
                  <div className="px-2.5 mt-0.5">
                    {size && (
                      <span className="text-[11px] font-medium text-[color:var(--ink-soft)]">
                        {size}
                      </span>
                    )}
                    {/* Waste/packaging rationale, demoted to one quiet line; full
                        text on hover so it never crowds the size. */}
                    {r.notes && (
                      <div
                        className="text-[10px] leading-snug text-[color:var(--ink-faint)] line-clamp-1"
                        title={r.notes}
                      >
                        {r.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  step="0.01"
                  aria-label="Quantity"
                  className={NUM_FIELD}
                  value={r.quantity}
                  onChange={(e) => update(r.id, { quantity: safeNum(e.target.value) })}
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  step="0.01"
                  aria-label="Unit price (USD)"
                  className={NUM_FIELD}
                  value={r.unitPrice}
                  onChange={(e) => update(r.id, { unitPrice: safeNum(e.target.value) })}
                />
              </div>
              <div className="col-span-2 flex items-center justify-end gap-1">
                <span className="font-display tabular text-[14px]">
                  {money(r.quantity * r.unitPrice)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label="Remove row"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-[color:var(--rose)] transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-1.5 inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--r-sm)] text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:bg-black/[0.04] self-start transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add line
      </button>
    </Card>
  );
}
