"use client";
import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";

/**
 * The handheld filter bar — one row of drawn selects over whichever list is on
 * screen.
 *
 * Native `<select>` on a phone opens the platform picker, which is the one part
 * of a select nobody should rebuild: a hand-rolled listbox is a worse control
 * on a touch screen than the OS wheel. So the CONTROL stays native and only its
 * frame is drawn — the same call the desktop composer made with `.bp-sel`.
 *
 * Each field is a real `<label>` + `<select>` (the shared `Select` wires the
 * `htmlFor`), so the bar is reachable and announced without a single tabindex.
 * Text is 16px: anything smaller makes iOS Safari zoom the page on focus, and
 * the zoom does not come back.
 */
export interface FilterField {
  key: string;
  label: string;
  value: string;
  allLabel: string;
  options: string[];
  optionLabel?: (v: string) => string;
}

export function TradeFilterBar({
  fields,
  shown,
  total,
  onChange,
  onClear,
}: {
  fields: FilterField[];
  shown: number;
  total: number;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}) {
  const active = fields.some((f) => f.value !== "");
  return (
    <div className="mb-4 rounded-[var(--r-md)] bg-[color:var(--paper-deep)] hairline px-3 pb-3 pt-2.5">
      <div className="flex items-center gap-1.5">
        <SlidersHorizontal className="h-3.5 w-3.5 text-[color:var(--ink-faint)]" />
        <span className="quiet-caps">Filter</span>
        <span className="tabular ml-auto text-[11px] text-[color:var(--ink-muted)]">
          {shown} of {total}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-2.5">
        {fields.map((f) => (
          <div key={f.key} className="min-w-[9rem] flex-1">
            <Select
              label={f.label}
              value={f.value}
              // The 44px target lives on the WRAPPER (the shared Select frames
              // the control at h-10); `className` lands on the <select> itself.
              wrapperClassName="h-11"
              className="text-[16px]"
              onChange={(e) => onChange(f.key, e.target.value)}
            >
              <option value="">{f.allLabel}</option>
              {f.options.map((o) => (
                <option key={o} value={o}>
                  {f.optionLabel ? f.optionLabel(o) : o}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>

      {active && (
        <Button
          variant="ghost"
          icon={<X className="h-3.5 w-3.5" />}
          className="mt-2.5 h-11 w-full"
          onClick={onClear}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
