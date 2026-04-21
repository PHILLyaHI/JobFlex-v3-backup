"use client";
import { Trash2, GripVertical } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useProposalDraftStore, type DraftLineItem } from "@/stores/useProposalDraftStore";
import { money } from "@/lib/format";

export function LineItemRow({ item }: { item: DraftLineItem }) {
  const update = useProposalDraftStore((s) => s.updateLine);
  const remove = useProposalDraftStore((s) => s.removeLine);
  const total = item.quantity * item.unitPrice;

  return (
    <div className="grid grid-cols-12 gap-2 items-start p-3 rounded-[var(--r-md)] hairline bg-white/40 dark:bg-white/[0.02]">
      <GripVertical className="col-span-1 h-4 w-4 mt-3 text-[color:var(--ink-faint)]" />
      <div className="col-span-4 space-y-2">
        <Input
          placeholder="Line item name"
          value={item.name}
          onChange={(e) => update(item.id, { name: e.target.value })}
        />
        <Input
          placeholder="Description (optional)"
          value={item.description ?? ""}
          onChange={(e) => update(item.id, { description: e.target.value })}
        />
      </div>
      <div className="col-span-2">
        <Select
          value={item.measurementType}
          onChange={(e) => update(item.id, { measurementType: e.target.value as any })}
        >
          <option value="SQFT">Sq ft</option>
          <option value="LINEAR_FT">Linear ft</option>
          <option value="CUBIC_FT">Cubic ft</option>
          <option value="UNIT">Unit</option>
          <option value="HOUR">Hour</option>
          <option value="LUMP_SUM">Lump sum</option>
        </Select>
      </div>
      <div className="col-span-1">
        <Input
          type="number"
          step="0.01"
          value={item.quantity}
          onChange={(e) => update(item.id, { quantity: Number(e.target.value) })}
        />
      </div>
      <div className="col-span-2">
        <Input
          type="number"
          step="0.01"
          prefix={<span className="text-[11px]">$</span>}
          value={item.unitPrice}
          onChange={(e) => update(item.id, { unitPrice: Number(e.target.value) })}
        />
      </div>
      <div className="col-span-1 pt-2.5 text-right font-display tabular text-[14px]">
        {money(total)}
      </div>
      <button
        type="button"
        onClick={() => remove(item.id)}
        className="col-span-1 mt-2.5 h-8 w-8 rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 grid place-items-center"
        aria-label="Remove line item"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
