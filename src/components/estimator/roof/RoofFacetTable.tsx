"use client";
import * as React from "react";
import type { RoofModel, EvLineType } from "@/lib/eagleview";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ChevronDown, AlertTriangle, TrendingUp } from "lucide-react";
import { LINE_COLORS, LINE_LABEL, cardinal, pitchLabel, pitchNumber } from "./roofViz";

const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// Footage chips for the roofing line types contractors price against.
const FOOTAGE_TYPES: EvLineType[] = ["EAVE", "RIDGE", "VALLEY", "HIP", "RAKE"];

export function RoofFacetTable({ model }: { model: RoofModel }) {
  const t = model.totals;
  const [showAll, setShowAll] = React.useState(false);

  // Facets largest-first for the detailed table.
  const faces = React.useMemo(
    () => [...model.faces].sort((a, b) => b.areaSqft - a.areaSqft),
    [model.faces],
  );

  // Area grouped by slope — the number a roofer actually reads first.
  const pitchGroups = React.useMemo(() => {
    const m = new Map<number, { count: number; area: number }>();
    for (const f of model.faces) {
      const p = Math.round(f.pitch);
      const g = m.get(p) ?? { count: 0, area: 0 };
      g.count += 1;
      g.area += f.areaSqft;
      m.set(p, g);
    }
    return [...m.entries()]
      .map(([pitch, g]) => ({ pitch, ...g, pct: t.areaSqft ? (g.area / t.areaSqft) * 100 : 0 }))
      .sort((a, b) => b.area - a.area);
  }, [model.faces, t.areaSqft]);

  const lowSlope = pitchGroups.filter((g) => g.pitch <= 2).reduce((a, g) => a + g.area, 0);
  const steep = pitchGroups.filter((g) => g.pitch >= 8).reduce((a, g) => a + g.area, 0);

  return (
    <div className="space-y-5">
      {/* Linear footage by type */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Linear footage</CardTitle>
            <CardSubtitle>Measured edge lengths that drive trim, ridge vent, and flashing.</CardSubtitle>
          </div>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {FOOTAGE_TYPES.map((lt) => (
            <div key={lt} className="flex items-center gap-2 rounded-full hairline px-3 py-1.5 text-[12px]">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: LINE_COLORS[lt] }} />
              <span className="text-[color:var(--ink-muted)]">{LINE_LABEL[lt]}</span>
              <span className="tabular font-medium text-[color:var(--ink)]">{num(t.footageByType[lt])} ft</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Pitch mix — the headline of the breakdown */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Pitch mix</CardTitle>
            <CardSubtitle>Area by slope — it drives the material, labor, and safety call.</CardSubtitle>
          </div>
          <span className="text-[12px] text-[color:var(--ink-muted)] tabular">
            {num(t.facetCount)} facets · {num(t.areaSqft)} sq ft
          </span>
        </CardHeader>

        {/* Roofer callouts — the decisions slope forces */}
        {(lowSlope > 0 || steep > 0) && (
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            {lowSlope > 0 && (
              <div
                className="flex items-start gap-2 rounded-[var(--r-sm)] px-3 py-2 text-[12px] leading-snug flex-1"
                style={{ background: "color-mix(in srgb, var(--amber) 14%, white)" }}
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--amber)]" />
                <span className="text-[color:var(--ink-soft)]">
                  <span className="font-semibold text-[color:var(--ink)] tabular">{num(lowSlope)} sq ft</span> is
                  low-slope (≤2/12) — needs a <strong>membrane / special underlayment</strong>, not standard shingles.
                </span>
              </div>
            )}
            {steep > 0 && (
              <div className="flex items-start gap-2 rounded-[var(--r-sm)] px-3 py-2 text-[12px] leading-snug flex-1 bg-[color:var(--accent-soft)]">
                <TrendingUp className="h-4 w-4 mt-0.5 shrink-0 text-[color:var(--accent-ink)]" />
                <span className="text-[color:var(--ink-soft)]">
                  <span className="font-semibold text-[color:var(--ink)] tabular">{num(steep)} sq ft</span> at 8/12+ —
                  expect a <strong>steep-slope labor</strong> surcharge.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Slope bars */}
        <div className="space-y-3.5">
          {pitchGroups.map((g) => {
            const low = g.pitch <= 2;
            const isSteep = g.pitch >= 8;
            return (
              <div key={g.pitch}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="flex items-baseline gap-2.5">
                    <span className="stat-numeric text-[22px] leading-none text-[color:var(--ink)]">
                      {pitchNumber(g.pitch)}
                      <span className="text-[11px] font-normal text-[color:var(--ink-faint)]">/12</span>
                    </span>
                    {low && <Badge tone="warn">Low-slope</Badge>}
                    {isSteep && <Badge tone="accent">Steep</Badge>}
                    <span className="text-[12px] text-[color:var(--ink-muted)]">
                      {g.count} facet{g.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="text-[13px] tabular whitespace-nowrap">
                    <span className="font-semibold text-[color:var(--ink)]">{num(g.area)}</span>
                    <span className="text-[color:var(--ink-faint)]"> sq ft</span>
                    <span className="text-[color:var(--ink-muted)] ml-2">{g.pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-2.5 rounded-full bg-[color:var(--paper-deep)] overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(g.pct, 1.5)}%`,
                      backgroundColor: low ? "var(--amber)" : "var(--accent)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Full per-facet list — tucked behind a disclosure */}
        <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className="flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--ink-muted)] hover:text-[color:var(--ink)] transition-colors"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAll ? "rotate-180" : ""}`} />
            {showAll ? "Hide" : "Show"} all {faces.length} facets
          </button>

          {showAll && (
            <div className="mt-3 max-h-80 overflow-y-auto -mx-1 px-1">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-[11px] uppercase tracking-wide text-[color:var(--ink-faint)] text-left">
                    <th className="font-medium py-1.5 pr-3">Facet</th>
                    <th className="font-medium py-1.5 pr-3">Facing</th>
                    <th className="font-medium py-1.5 pr-3">Pitch</th>
                    <th className="font-medium py-1.5 pr-3 text-right">Area (sq ft)</th>
                    <th className="font-medium py-1.5 pl-3 text-right">% of roof</th>
                  </tr>
                </thead>
                <tbody>
                  {faces.map((f, i) => {
                    const pct = t.areaSqft ? (f.areaSqft / t.areaSqft) * 100 : 0;
                    return (
                      <tr key={f.id} className="border-t border-[color:var(--ink-line)]">
                        <td className="py-1.5 pr-3 text-[color:var(--ink-muted)]">{f.designator || i + 1}</td>
                        <td className="py-1.5 pr-3 tabular">{cardinal(f.orientation)}</td>
                        <td className="py-1.5 pr-3 tabular">{pitchLabel(f.pitch)}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{num(f.areaSqft, 1)}</td>
                        <td className="py-1.5 pl-3 text-right tabular text-[color:var(--ink-muted)]">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
