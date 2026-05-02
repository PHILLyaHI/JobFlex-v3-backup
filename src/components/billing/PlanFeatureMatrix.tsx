import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  ALL_FEATURES,
  FEATURE_LABELS,
  PLAN_TIERS,
  hasFeature,
  type Feature,
  type Plan,
} from "@/lib/entitlements";

const PLAN_DISPLAY: Record<Plan, { label: string; price: string; cadence: string }> = {
  FREE: { label: "Free", price: "$0", cadence: "forever" },
  STARTER: { label: "Starter", price: "$29", cadence: "per month" },
  PROFESSIONAL: { label: "Professional", price: "$89", cadence: "per month" },
  ENTERPRISE: { label: "Enterprise", price: "Custom", cadence: "annual" },
};

export function PlanFeatureMatrix({ currentPlan }: { currentPlan: Plan }) {
  return (
    <div className="paper-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-[color:var(--ink-line)]">
              <th className="text-left px-5 py-4 quiet-caps">Feature</th>
              {PLAN_TIERS.map((p) => {
                const d = PLAN_DISPLAY[p];
                const active = p === currentPlan;
                return (
                  <th
                    key={p}
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
                      {d.label}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1.5">
                      <span className="stat-numeric text-[20px]">{d.price}</span>
                      <span className="text-[10px] text-[color:var(--ink-muted)]">{d.cadence}</span>
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
                {PLAN_TIERS.map((p) => {
                  const on = hasFeature(p, f);
                  const active = p === currentPlan;
                  return (
                    <td
                      key={p}
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
