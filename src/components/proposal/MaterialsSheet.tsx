"use client";
import * as React from "react";
import { Copy, Package, ExternalLink } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";
import { MaterialThumb } from "@/components/materials/MaterialThumb";
import { merchantUrl } from "@/lib/merchantLinks";

export interface MaterialLine {
  id: string;
  name: string;
  description?: string | null;
  measurementType: string;
  quantity: number;
  materialCost: number;
  // Live-pricing product data, present on AI-estimated materials. Optional so
  // non-estimate callers (e.g. a single editor line) still type-check and just
  // render without a thumbnail or buy link.
  store?: string | null;
  productUrl?: string | null;
  imageUrl?: string | null;
  dimensions?: string | null;
}

const UNIT_LABEL: Record<string, string> = {
  SQFT: "sq ft",
  LINEAR_FT: "linear ft",
  CUBIC_FT: "cu ft",
  UNIT: "unit",
  HOUR: "hour",
  LUMP_SUM: "lump sum",
};

/** Whole number when it is one, else trimmed to 2 decimals. */
function formatQty(q: number): string {
  return Number.isInteger(q) ? String(q) : q.toFixed(2).replace(/\.?0+$/, "");
}

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
      // Render-time link fix: a real merchant link is kept, a Google/empty one
      // is swapped for a direct on-site search at the named store.
      buyHref: merchantUrl(i.store, i.name, i.productUrl),
    }));
  const grandTotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  const shoppable = lines.filter((l) => l.buyHref).length;

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

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Order materials"
      description={`${proposalTitle} · ${clientName}`}
      width="min(560px, 100vw)"
      footer={
        // Subtotal lives here so it's pinned to the bottom of the screen and
        // stays visible regardless of scroll. Copy list is the single action.
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="quiet-caps !mb-0 text-[color:var(--ink-faint)]">Materials total</div>
            <div className="mt-0.5 font-display tabular text-[26px] leading-none tracking-[-0.015em] text-[color:var(--accent)]">
              {money(grandTotal)}
            </div>
            <div className="mt-1 text-[10.5px] text-[color:var(--ink-muted)] tabular">
              {lines.length} item{lines.length === 1 ? "" : "s"}
              {shoppable > 0 ? ` · ${shoppable} shoppable` : ""}
            </div>
          </div>
          <Button
            variant="outline"
            icon={<Copy className="h-3.5 w-3.5" />}
            onClick={copyList}
            disabled={lines.length === 0}
          >
            Copy list
          </Button>
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
        <div className="space-y-4">
          {/* Product rows — image-led shop tickets. Each lifts on hover and
              carries a confident "Buy at {store}" CTA when a link resolves. */}
          <ul className="space-y-2.5">
            {lines.map((l) => (
              <li
                key={l.id}
                className="rounded-[var(--r-md)] hairline bg-[color:var(--paper)] p-3 transition-shadow hover:shadow-[var(--shadow-md)]"
              >
                <div className="flex items-center gap-3.5">
                  <MaterialThumb src={l.imageUrl ?? null} alt={l.name} />

                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[14px] leading-snug text-[color:var(--ink)] truncate">
                      {l.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[color:var(--ink-muted)]">
                      {(l.dimensions || l.description) && (
                        <span className="truncate max-w-[220px]">{l.dimensions || l.description}</span>
                      )}
                      <span className="tabular">
                        Qty {formatQty(l.quantity)} {l.unit}
                      </span>
                      <span className="text-[color:var(--ink-faint)]">·</span>
                      <span className="tabular">{money(l.materialCost)}/unit</span>
                      {l.store && (
                        <span className="inline-flex items-center rounded-full bg-[color:var(--paper-deep)] px-2 py-0.5 text-[10px] font-medium text-[color:var(--ink-soft)]">
                          {l.store}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="font-display tabular text-[16px] tracking-[-0.01em] text-[color:var(--ink)]">
                      {money(l.lineTotal)}
                    </div>
                  </div>
                </div>

                {l.buyHref && (
                  <div className="mt-2.5 flex justify-end">
                    <a href={l.buyHref} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />}>
                        {l.store ? `Buy at ${l.store}` : "View product"}
                      </Button>
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <p className="text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
            Totals reflect <em>base</em> material costs only — markups, overhead, and profit live
            in the proposal&apos;s Estimate breakdown. Each store link jumps straight to the item at
            that retailer.
          </p>
        </div>
      )}
    </Sheet>
  );
}
