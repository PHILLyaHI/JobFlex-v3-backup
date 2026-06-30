"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, GripVertical, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useProposalDraftStore, type DraftLineItem } from "@/stores/useProposalDraftStore";
import { money } from "@/lib/format";
import { cn } from "@/lib/cn";
import { RatioSlider } from "./RatioSlider";

const MEASUREMENT_OPTIONS: { value: DraftLineItem["measurementType"]; label: string }[] = [
  { value: "SQFT", label: "Sq ft" },
  { value: "LINEAR_FT", label: "Linear ft" },
  { value: "CUBIC_FT", label: "Cubic ft" },
  { value: "UNIT", label: "Unit" },
  { value: "HOUR", label: "Hour" },
  { value: "LUMP_SUM", label: "Lump sum" },
];

export function LineItemRow({ item }: { item: DraftLineItem }) {
  const update = useProposalDraftStore((s) => s.updateLine);
  const remove = useProposalDraftStore((s) => s.removeLine);
  const [expanded, setExpanded] = React.useState(false);

  const perUnit = (item.materialCost ?? 0) + (item.laborCost ?? 0);
  // Auto-sync unitPrice from material+labor whenever either changes.
  const handleMaterial = (v: number) => {
    const mat = isNaN(v) ? 0 : v;
    update(item.id, { materialCost: mat, unitPrice: mat + (item.laborCost ?? 0) });
  };
  const handleLabor = (v: number) => {
    const lab = isNaN(v) ? 0 : v;
    update(item.id, { laborCost: lab, unitPrice: (item.materialCost ?? 0) + lab });
  };
  const handleRatio = ({ materialCost, laborCost }: { materialCost: number; laborCost: number }) => {
    update(item.id, { materialCost, laborCost, unitPrice: materialCost + laborCost });
  };
  const materialPct = perUnit > 0 ? ((item.materialCost ?? 0) / perUnit) * 100 : 50;
  const total = item.quantity * (item.unitPrice || perUnit);

  return (
    <div
      className={cn(
        "rounded-[var(--r-md)] hairline bg-white/40 dark:bg-white/[0.02] transition-shadow",
        "focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]",
      )}
    >
      {/* Compact row — 12 col grid, single-line height */}
      <div className="grid grid-cols-12 gap-2 items-center p-3">
        <GripVertical className="col-span-1 h-4 w-4 text-[color:var(--ink-faint)] shrink-0" />

        <div className="col-span-3 min-w-0">
          <Input
            placeholder="Line item name"
            value={item.name}
            onChange={(e) => update(item.id, { name: e.target.value })}
          />
        </div>

        <div className="col-span-2">
          <Select
            value={item.measurementType}
            onChange={(e) =>
              update(item.id, { measurementType: e.target.value as DraftLineItem["measurementType"] })
            }
          >
            {MEASUREMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="col-span-2">
          <Input
            type="number"
            step="0.01"
            aria-label="Quantity"
            value={item.quantity}
            onChange={(e) => update(item.id, { quantity: Number(e.target.value) })}
          />
        </div>

        {/* Total, with the per-unit figure folded underneath (frees the qty column). */}
        <div className="col-span-2 text-right leading-tight">
          <div className="font-display tabular text-[14px] text-[color:var(--ink)]">
            {money(total)}
          </div>
          <div className="mt-0.5 text-[10px] tabular text-[color:var(--ink-faint)]">
            {money(item.unitPrice || perUnit)} / ea
          </div>
        </div>

        <div className="col-span-2 flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            aria-label={expanded ? "Hide cost breakdown" : "Show cost breakdown"}
            className={cn(
              "h-8 w-8 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04] transition-transform",
              expanded && "rotate-180 bg-black/[0.04]",
            )}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => remove(item.id)}
            className="h-8 w-8 rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 grid place-items-center"
            aria-label="Remove line item"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable cost breakdown */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-[color:var(--ink-line)]"
          >
            <div className="px-3 pt-3 pb-4">
              <div className="mb-3">
                <Input
                  placeholder="Description (optional) — appears under the name on the proposal"
                  value={item.description ?? ""}
                  onChange={(e) => update(item.id, { description: e.target.value })}
                />
              </div>
              <div className="quiet-caps mb-2">Cost breakdown · per unit</div>
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <Input
                    label="Material $/unit"
                    type="number"
                    step="0.01"
                    prefix={<span className="text-[11px]">$</span>}
                    value={item.materialCost ?? 0}
                    onChange={(e) => handleMaterial(Number(e.target.value))}
                  />
                </div>
                <div className="col-span-4">
                  <Input
                    label="Labor $/unit"
                    type="number"
                    step="0.01"
                    prefix={<span className="text-[11px]">$</span>}
                    value={item.laborCost ?? 0}
                    onChange={(e) => handleLabor(Number(e.target.value))}
                  />
                </div>
                <div className="col-span-4">
                  <div className="paper-card px-3 py-2">
                    <div className="quiet-caps">Per unit</div>
                    <div className="font-display tabular text-[20px] mt-0.5">
                      {money(perUnit)}
                    </div>
                    <div className="text-[10px] text-[color:var(--ink-muted)] tabular mt-0.5">
                      ${(item.materialCost ?? 0).toFixed(2)} mat ·{" "}
                      ${(item.laborCost ?? 0).toFixed(2)} labor
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-[color:var(--ink-line)]">
                <div className="quiet-caps mb-2">Ratio</div>
                <RatioSlider
                  total={perUnit}
                  materialPct={materialPct}
                  onChange={handleRatio}
                />
              </div>
              <p className="text-[10.5px] text-[color:var(--ink-muted)] mt-3 leading-relaxed">
                These are <em>base</em> costs before markups. Set company markups + overhead +
                profit in the Estimate breakdown below.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
