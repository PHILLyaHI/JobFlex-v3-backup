"use client";
import { Save, ChevronRight, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { money } from "@/lib/format";
import type { EstimateDiscount } from "@/lib/estimatorSchema";

interface EstimatorSummaryProps {
  materialsTotal: number;
  laborTotal: number;
  assumptions: string[];
  onConvert: () => Promise<void> | void;
  onSave: () => Promise<void> | void;
  convertLoading?: boolean;
  saveLoading?: boolean;
  disabled?: boolean;
  /** Order-level discount set by the AI refine ("10% off") — flows into the proposal. */
  discount?: EstimateDiscount | null;
  onRemoveDiscount?: () => void;
  /** AI's estimated working days, shown under the total when present. */
  timelineDays?: number | null;
}

export function EstimatorSummary({
  materialsTotal,
  laborTotal,
  assumptions,
  onConvert,
  onSave,
  convertLoading,
  saveLoading,
  disabled,
  discount,
  onRemoveDiscount,
  timelineDays,
}: EstimatorSummaryProps) {
  const subtotal = materialsTotal + laborTotal;
  // Mirror the convert action's clamps so the card never shows a discount the
  // proposal wouldn't honor (percent ≤ 100, dollars ≤ subtotal).
  const discountAmt = discount
    ? Math.min(
        subtotal,
        discount.isPercent ? (subtotal * Math.min(discount.amount, 100)) / 100 : discount.amount,
      )
    : 0;
  const total = subtotal - discountAmt;
  return (
    <Card className="sticky top-20">
      <CardHeader>
        <div>
          <CardTitle>Summary</CardTitle>
          <CardSubtitle>Estimated project economics</CardSubtitle>
        </div>
      </CardHeader>

      <div className="space-y-1 text-[13px]">
        <Row label="Materials" value={money(materialsTotal)} />
        <Row label="Labor" value={money(laborTotal)} />
        {discount && (
          <div className="flex items-center justify-between py-1">
            <span className="flex min-w-0 items-center gap-1 text-[color:var(--ink-muted)]">
              <span className="truncate">Discount · {discount.label}</span>
              {onRemoveDiscount && (
                <button
                  type="button"
                  onClick={onRemoveDiscount}
                  aria-label="Remove discount"
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[color:var(--ink-faint)] hover:bg-rose-50 hover:text-[color:var(--rose)] transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
            <span className="font-display tabular text-[16px] text-[color:var(--ink)]">
              −{money(discountAmt)}
            </span>
          </div>
        )}
      </div>

      <div className="h-px bg-[color:var(--ink-line)] my-4" />

      <div className="flex items-end justify-between">
        <span className="quiet-caps">Total</span>
        <span className="stat-numeric text-[38px] leading-none text-[color:var(--ink)]">
          {money(total)}
        </span>
      </div>
      {typeof timelineDays === "number" && timelineDays > 0 && (
        <div className="mt-2 text-right text-[12px] text-[color:var(--ink-muted)]">
          Est. timeline · {timelineDays} {timelineDays === 1 ? "day" : "days"}
        </div>
      )}

      {assumptions.length > 0 && (
        <div className="mt-6 pt-5 border-t border-[color:var(--ink-line)]">
          <div className="quiet-caps mb-2">Assumptions</div>
          <ul className="space-y-1.5">
            {assumptions.map((a, i) => (
              <li
                key={i}
                className="text-[12px] leading-snug text-[color:var(--ink-muted)] pl-3 relative"
              >
                <span className="absolute left-0 top-[7px] h-1 w-1 rounded-full bg-[color:var(--ink-faint)]" />
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        <Button
          size="lg"
          onClick={onConvert}
          loading={convertLoading}
          disabled={disabled}
          icon={<ChevronRight className="h-4 w-4" />}
        >
          Convert to proposal
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={onSave}
          loading={saveLoading}
          disabled={disabled}
          icon={<Save className="h-3.5 w-3.5" />}
        >
          Save estimate
        </Button>
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[color:var(--ink-muted)]">{label}</span>
      <span className="font-display tabular text-[16px] text-[color:var(--ink)]">{value}</span>
    </div>
  );
}
