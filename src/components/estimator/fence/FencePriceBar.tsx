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
import { priceFence } from "./fencePricing";

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
    return {
      lengthFt: layout.totalLengthFt,
      price: priceFence(
        { lengthFt: layout.totalLengthFt, height, material, openings: gates, demolition },
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
          {Math.round(lengthFt)} lf · {usd(price.perFoot)}/lf
        </div>
      </div>

      <div className="px-4 py-3 space-y-1.5">
        {price.breakdown.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="text-[color:var(--ink-muted)] truncate">{line.label}</span>
            <span className="tabular text-[color:var(--ink-soft)] shrink-0">{usd(line.amount)}</span>
          </div>
        ))}
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
