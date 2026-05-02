"use client";
import * as React from "react";
import { Bookmark } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MarkupSlider } from "./MarkupSlider";
import { useProposalDraftStore } from "@/stores/useProposalDraftStore";
import { toast } from "@/components/ui/Toast";
import { money } from "@/lib/format";

export function EstimateBreakdown() {
  const draft = useProposalDraftStore((s) => s.draft);
  const setMarkup = useProposalDraftStore((s) => s.setMarkup);

  // ── Compute rollup
  const baseMaterials = draft.lineItems.reduce(
    (a, l) => a + l.quantity * (l.materialCost ?? 0),
    0,
  );
  const baseLabor = draft.lineItems.reduce(
    (a, l) => a + l.quantity * (l.laborCost ?? 0),
    0,
  );
  const matMarkupPct = draft.materialMarkupPct ?? 0;
  const labMarkupPct = draft.laborMarkupPct ?? 0;
  const overheadPct = draft.overheadPct ?? 0;
  const profitPct = draft.profitPct ?? 0;

  const materialsAfter = baseMaterials * (1 + matMarkupPct / 100);
  const laborAfter = baseLabor * (1 + labMarkupPct / 100);
  const subtotalCosts = materialsAfter + laborAfter;
  const overheadAmount = subtotalCosts * (overheadPct / 100);
  const subtotalWithOverhead = subtotalCosts + overheadAmount;
  const profitAmount = subtotalWithOverhead * (profitPct / 100);
  const grandTotal = subtotalWithOverhead + profitAmount;

  const baseTotal = baseMaterials + baseLabor;
  const margin = grandTotal > 0 ? ((grandTotal - baseTotal) / grandTotal) * 100 : 0;

  return (
    <Card className="mt-5 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[color:var(--accent)]/[0.06] blur-3xl pointer-events-none"
      />
      <div className="relative">
        <CardHeader>
          <div>
            <CardTitle>Estimate breakdown</CardTitle>
            <CardSubtitle>
              Drag the bars to set markups. Base costs come from your line items.
            </CardSubtitle>
          </div>
          <Badge tone={margin >= 25 ? "success" : margin >= 15 ? "accent" : "warn"}>
            Margin · {margin.toFixed(1)}%
          </Badge>
        </CardHeader>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 items-start">
          {/* Sliders */}
          <div className="space-y-5">
            <MarkupSlider
              category="materials"
              value={matMarkupPct}
              onChange={(v) => setMarkup({ materialMarkupPct: v })}
              baseAmount={baseMaterials}
              computedAmount={materialsAfter}
              caption="markup over base"
              max={100}
            />
            <MarkupSlider
              category="labor"
              value={labMarkupPct}
              onChange={(v) => setMarkup({ laborMarkupPct: v })}
              baseAmount={baseLabor}
              computedAmount={laborAfter}
              caption="markup over base"
              max={100}
            />
            <MarkupSlider
              category="overhead"
              value={overheadPct}
              onChange={(v) => setMarkup({ overheadPct: v })}
              baseAmount={subtotalCosts}
              computedAmount={overheadAmount}
              caption="of subtotal"
              max={50}
            />
            <MarkupSlider
              category="profit"
              value={profitPct}
              onChange={(v) => setMarkup({ profitPct: v })}
              baseAmount={subtotalWithOverhead}
              computedAmount={profitAmount}
              caption="of cost + overhead"
              max={50}
            />
          </div>

          {/* Right: summary */}
          <div className="paper-card p-5">
            <div className="quiet-caps mb-3">Estimate</div>
            <div className="space-y-1.5 text-[13px]">
              <Row label="Base · materials" value={money(baseMaterials)} muted />
              <Row label="Base · labor" value={money(baseLabor)} muted />
              <Row
                label={`+ Materials markup (${matMarkupPct.toFixed(1)}%)`}
                value={money(materialsAfter - baseMaterials)}
              />
              <Row
                label={`+ Labor markup (${labMarkupPct.toFixed(1)}%)`}
                value={money(laborAfter - baseLabor)}
              />
              <div className="h-px bg-[color:var(--ink-line)] my-2" />
              <Row label="Subtotal" value={money(subtotalCosts)} bold />
              <Row
                label={`+ Overhead (${overheadPct.toFixed(1)}%)`}
                value={money(overheadAmount)}
              />
              <Row
                label={`+ Profit (${profitPct.toFixed(1)}%)`}
                value={money(profitAmount)}
              />
            </div>

            <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)] flex items-end justify-between">
              <span className="quiet-caps">Grand total</span>
              <span className="stat-numeric text-[34px] leading-none text-[color:var(--ink)]">
                {money(grandTotal)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => toast.success("Saved as company defaults", "Future proposals will start with these markups.")}
              className="mt-5 inline-flex items-center gap-1.5 text-[11px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors"
            >
              <Bookmark className="h-3 w-3" />
              Save these as company defaults
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span
        className={
          muted
            ? "text-[color:var(--ink-muted)]"
            : bold
              ? "text-[color:var(--ink)] font-medium"
              : "text-[color:var(--ink-soft)]"
        }
      >
        {label}
      </span>
      <span
        className={
          (bold ? "font-display text-[16px] " : "text-[12px] ") +
          "tabular text-[color:var(--ink)]"
        }
      >
        {value}
      </span>
    </div>
  );
}
