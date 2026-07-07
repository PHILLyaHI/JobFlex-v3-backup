import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { ALL_FEATURES, FEATURE_LABELS, hasFeature, type Feature } from "@/lib/entitlements";
import {
  featureTierForSlug,
  formatPlanPrice,
  priceCadence,
  type PlanDTO,
} from "@/lib/planCatalog";

// Columns come from the live plan catalog (admin-managed PricingPlan rows);
// per-feature availability stays code-driven via MINIMUM_PLAN_FOR — custom
// plans render the ENTERPRISE column pattern, matching their runtime gating.
export function PlanFeatureMatrix({
  plans,
  currentSlug,
}: {
  plans: PlanDTO[];
  currentSlug: string | null;
}) {
  return (
    <div className="paper-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-[color:var(--ink-line)]">
              <th className="text-left px-5 py-4 quiet-caps">Feature</th>
              {plans.map((p) => {
                const active = p.slug === currentSlug;
                return (
                  <th
                    key={p.slug}
                    className={cn(
                      "text-left px-5 py-4 border-l border-[color:var(--ink-line)]",
                      active && "bg-[color:var(--accent-soft)]/50",
                    )}
                  >
                    <div
                      className={cn(
                        "font-display text-[17px] tracking-[-0.01em]",
                        active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink)]",
                      )}
                    >
                      {p.name}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="stat-numeric text-[20px]">{formatPlanPrice(p.priceCents)}</span>
                      <span className="text-[10px] text-[color:var(--ink-muted)]">
                        {priceCadence(p.isFree)}
                      </span>
                    </div>
                    {active && (
                      <div className="mt-1.5 quiet-caps !tracking-[0.18em] text-[color:var(--accent)]">
                        Current
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ALL_FEATURES.map((f: Feature, idx) => (
              <tr
                key={f}
                className={cn(
                  "border-b border-[color:var(--ink-line)] last:border-0",
                  idx % 2 === 1 && "bg-black/[0.012]",
                )}
              >
                <td className="px-5 py-3 text-[13px] text-[color:var(--ink-soft)]">
                  {FEATURE_LABELS[f]}
                </td>
                {plans.map((p) => {
                  const on = hasFeature(featureTierForSlug(p.slug), f);
                  const active = p.slug === currentSlug;
                  return (
                    <td
                      key={p.slug}
                      className={cn(
                        "px-5 py-3 border-l border-[color:var(--ink-line)]",
                        active && "bg-[color:var(--accent-soft)]/40",
                      )}
                    >
                      {on ? (
                        <Check className="h-4 w-4 text-[color:var(--ink)]" />
                      ) : (
                        <Minus className="h-4 w-4 text-[color:var(--ink-faint)]" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
