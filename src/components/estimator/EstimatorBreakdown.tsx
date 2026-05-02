"use client";
import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface EstimateLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

interface BreakdownProps {
  title: string;
  subtitle: string;
  rows: EstimateLine[];
  onChange: (rows: EstimateLine[]) => void;
}

export function EstimatorBreakdown({ title, subtitle, rows, onChange }: BreakdownProps) {
  function update(id: string, patch: Partial<EstimateLine>) {
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function remove(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }
  function add() {
    onChange([
      ...rows,
      { id: nanoid(6), name: "", quantity: 1, unitPrice: 0, unit: "unit" },
    ]);
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

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-12 gap-2 px-1">
          <div className="quiet-caps col-span-6">Item</div>
          <div className="quiet-caps col-span-2 text-right">Qty</div>
          <div className="quiet-caps col-span-2 text-right">Unit $</div>
          <div className="quiet-caps col-span-2 text-right">Total</div>
        </div>

        {rows.map((r) => (
          <div
            key={r.id}
            className={cn(
              "grid grid-cols-12 gap-2 items-start rounded-[var(--r-md)] hairline bg-white/40 dark:bg-white/[0.02] p-2",
            )}
          >
            <div className="col-span-6">
              <Input
                value={r.name}
                onChange={(e) => update(r.id, { name: e.target.value })}
                placeholder="Line item"
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                step="0.01"
                value={r.quantity}
                onChange={(e) => update(r.id, { quantity: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                step="0.01"
                prefix={<span className="text-[11px]">$</span>}
                value={r.unitPrice}
                onChange={(e) => update(r.id, { unitPrice: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2 flex items-center justify-end gap-1 pt-2.5">
              <span className="font-display tabular text-[14px]">
                {money(r.quantity * r.unitPrice)}
              </span>
              <button
                type="button"
                onClick={() => remove(r.id)}
                aria-label="Remove row"
                className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={add}
          className="mt-1 inline-flex items-center gap-1.5 h-9 px-3 rounded-[var(--r-sm)] text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] hover:bg-black/[0.04] self-start transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Add line
        </button>
      </div>
    </Card>
  );
}
