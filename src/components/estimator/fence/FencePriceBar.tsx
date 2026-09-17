"use client";
// The studio's memorable anchor: an elevated price "ticket" whose oversized
// tabular total recomputes live (via priceFence) on every spec change. Computed
// with useMemo from reactive store fields — NOT store.computed() — so React's
// useSyncExternalStore never sees an uncached snapshot.
import * as React from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useFenceStudioStore } from "@/stores/useFenceStudioStore";
import { materialLabel, variantLabel } from "./fenceTypes";
import { computeFenceLayout } from "./fenceGeometry";
import { buildFenceEstimate } from "./fencePricing";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function FencePriceBar({ onConvert, converting }: { onConvert: () => void; converting?: boolean }) {
  const points = useFenceStudioStore((s) => s.spec.points);
  const height = useFenceStudioStore((s) => s.spec.height);
  const material = useFenceStudioStore((s) => s.spec.material);
  const gates = useFenceStudioStore((s) => s.spec.gates);
  const demolition = useFenceStudioStore((s) => s.spec.demolition);
  const pricing = useFenceStudioStore((s) => s.pricing);
  const customMaterials = useFenceStudioStore((s) => s.customMaterials);
  const customOpenings = useFenceStudioStore((s) => s.customOpenings);

  const { lengthFt, price } = React.useMemo(() => {
    const layout = computeFenceLayout(points, gates);
    const labels = {
      material: materialLabel(material, customMaterials),
      opening: (_k: "gate" | "door", v: string) => variantLabel(v, customOpenings),
    };
    // The drawn layout's own posts and bays go into the estimate, so the bill
    // of materials counts the posts standing in the 3D view (audit 2026-09-17).
    return {
      lengthFt: layout.totalLengthFt,
      price: buildFenceEstimate(
        {
          lengthFt: layout.totalLengthFt,
          height,
          material,
          openings: gates,
          demolition,
          layout: { postCount: layout.postCount, bayCount: layout.bayCount },
        },
        pricing,
        labels,
      ),
    };
  }, [points, height, material, gates, demolition, pricing, customMaterials, customOpenings]);

  const empty = lengthFt <= 0;

  return (
    <div className="rounded-[var(--r-lg)] bg-[color:var(--paper)] hairline shadow-[var(--shadow-md)] overflow-hidden">
      <div className="p-4 pb-3 bg-[color:var(--accent-soft)]">
        <div className="quiet-caps text-[color:var(--accent-ink)]">Estimated total</div>
        <div className="mt-1 font-display tabular text-[40px] leading-none text-[color:var(--accent-ink)]">
          {usd(price.total)}
        </div>
        <div className="mt-1.5 text-[12px] text-[color:var(--ink-muted)] tabular">
          {Math.round(price.billedFt)} lf · {usd(price.perFoot)}/lf
        </div>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {price.lines.map((line, i) => (
          <div key={`${line.name}-${i}`} className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="text-[color:var(--ink-muted)] truncate">
              {line.name} · {line.quantity} {line.unit}
            </span>
            <span className="tabular text-[color:var(--ink-soft)] shrink-0">{usd(line.amount)}</span>
          </div>
        ))}
        {/* Material and labor carry their own subtotals; the total is their sum. */}
        {!empty && (
          <div className="pt-1.5 mt-1 border-t border-[color:var(--rule)] space-y-1">
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="quiet-caps text-[color:var(--ink-muted)]">Materials</span>
              <span className="tabular text-[color:var(--ink-soft)]">{usd(price.materialSubtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 text-[12px]">
              <span className="quiet-caps text-[color:var(--ink-muted)]">Labor</span>
              <span className="tabular text-[color:var(--ink-soft)]">{usd(price.laborSubtotal)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-1">
        <Button
          size="lg"
          className="w-full"
          onClick={onConvert}
          loading={converting}
          disabled={empty}
          icon={<FileText className="h-4 w-4" />}
        >
          Convert to proposal
        </Button>
      </div>
    </div>
  );
}
