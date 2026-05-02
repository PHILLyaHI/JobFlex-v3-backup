"use client";
import * as React from "react";
import { Copy, Mail, Package } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";

export interface MaterialLine {
  id: string;
  name: string;
  description?: string | null;
  measurementType: string;
  quantity: number;
  materialCost: number;
}

const UNIT_LABEL: Record<string, string> = {
  SQFT: "sq ft",
  LINEAR_FT: "linear ft",
  CUBIC_FT: "cu ft",
  UNIT: "unit",
  HOUR: "hour",
  LUMP_SUM: "lump sum",
};

interface MaterialsSheetProps {
  open: boolean;
  onClose: () => void;
  proposalTitle: string;
  clientName: string;
  items: MaterialLine[];
}

export function MaterialsSheet({
  open,
  onClose,
  proposalTitle,
  clientName,
  items,
}: MaterialsSheetProps) {
  const lines = items
    .filter((i) => (i.materialCost ?? 0) > 0 && i.quantity > 0)
    .map((i) => ({
      ...i,
      lineTotal: i.materialCost * i.quantity,
      unit: UNIT_LABEL[i.measurementType] ?? i.measurementType.toLowerCase(),
    }));
  const grandTotal = lines.reduce((a, l) => a + l.lineTotal, 0);

  const plainText = React.useMemo(() => {
    const header = `Materials list — ${proposalTitle} (${clientName})\n${"".padEnd(60, "─")}\n`;
    const body = lines
      .map(
        (l) =>
          `${l.name.padEnd(36)} ${String(l.quantity).padStart(6)} × ${l.unit.padEnd(10)}  ${money(l.materialCost).padStart(8)}/u  ${money(l.lineTotal).padStart(10)}`,
      )
      .join("\n");
    const footer = `\n${"".padEnd(60, "─")}\nMaterials total: ${money(grandTotal)}`;
    return header + body + footer;
  }, [lines, grandTotal, proposalTitle, clientName]);

  function copyList() {
    navigator.clipboard?.writeText(plainText);
    toast.success("Copied to clipboard", "Paste into Slack, an email, or a supplier portal.");
  }

  function emailSupplier() {
    const subject = `Materials request — ${proposalTitle}`;
    const body = `Hi,\n\nPlease quote the following materials for an upcoming job:\n\n${plainText}\n\nThanks,`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Order materials"
      description={`${proposalTitle} · ${clientName}`}
      width="min(560px, 100vw)"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-[color:var(--ink-muted)] tabular">
            {lines.length} item{lines.length === 1 ? "" : "s"} · {money(grandTotal)} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              icon={<Copy className="h-3.5 w-3.5" />}
              onClick={copyList}
              disabled={lines.length === 0}
            >
              Copy list
            </Button>
            <Button
              icon={<Mail className="h-3.5 w-3.5" />}
              onClick={emailSupplier}
              disabled={lines.length === 0}
            >
              Email supplier
            </Button>
          </div>
        </div>
      }
    >
      {lines.length === 0 ? (
        <div className="paper-card p-6 flex items-start gap-3">
          <Package className="h-5 w-5 text-[color:var(--ink-muted)] shrink-0 mt-0.5" />
          <div>
            <div className="text-[13px] font-medium text-[color:var(--ink)]">
              No materials on this proposal
            </div>
            <div className="text-[11.5px] text-[color:var(--ink-muted)] mt-1 leading-relaxed">
              Add Material $/unit values to line items in the editor. Lines with $0 material cost
              are excluded automatically.
            </div>
          </div>
        </div>
      ) : (
        <div>
          <div className="quiet-caps mb-2">Line items</div>
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {lines.map((l) => (
              <li key={l.id} className="py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-medium text-[color:var(--ink)] text-[13.5px]">{l.name}</div>
                  <div className="font-display tabular text-[15px] text-[color:var(--ink)] shrink-0">
                    {money(l.lineTotal)}
                  </div>
                </div>
                {l.description && (
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                    {l.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-[color:var(--ink-muted)] tabular">
                  <span>
                    {l.quantity} × {l.unit}
                  </span>
                  <span>·</span>
                  <span>{money(l.materialCost)} / unit</span>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)] flex items-baseline justify-between">
            <span className="quiet-caps">Materials total</span>
            <span className="font-display text-[26px] tabular text-[color:var(--ink)] tracking-[-0.015em]">
              {money(grandTotal)}
            </span>
          </div>
          <p className="mt-4 text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
            Totals reflect <em>base</em> material costs only — markups, overhead, and profit live
            in the proposal's Estimate breakdown.
          </p>
        </div>
      )}
    </Sheet>
  );
}
