"use client";
// Sandbox control rail — material / height / runs / gates / demolition.
// Presentational: it reads and writes the studio store and holds no business
// logic. Material is shown as real colour swatches (the studio's memorable
// anchor); selecting a Run highlights it in 3D and targets where gates land.
import * as React from "react";
import { Plus, Minus, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFenceStudioStore } from "@/stores/useFenceStudioStore";
import { FENCE_MATERIALS, FENCE_HEIGHTS, MATERIAL_LABEL, type FenceMaterial } from "./fenceTypes";

// Swatch ≈ the rendered material, so the chip previews the 3D result.
const MATERIAL_SWATCH: Record<FenceMaterial, string> = {
  cedar: "#b07a47",
  vinyl: "#eef0ee",
  "chain-link": "#9aa0a6",
  aluminum: "#2c3036",
  composite: "#6f6a60",
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="quiet-caps">{label}</div>
      {children}
    </div>
  );
}

export function FenceToolbelt() {
  const material = useFenceStudioStore((s) => s.spec.material);
  const height = useFenceStudioStore((s) => s.spec.height);
  const gates = useFenceStudioStore((s) => s.spec.gates);
  const demolition = useFenceStudioStore((s) => s.spec.demolition);
  const points = useFenceStudioStore((s) => s.spec.points);
  const selectedSegment = useFenceStudioStore((s) => s.spec.selectedSegment);
  const setMaterial = useFenceStudioStore((s) => s.setMaterial);
  const setHeight = useFenceStudioStore((s) => s.setHeight);
  const setDemolition = useFenceStudioStore((s) => s.setDemolition);
  const addGate = useFenceStudioStore((s) => s.addGate);
  const removeGate = useFenceStudioStore((s) => s.removeGate);
  const selectSegment = useFenceStudioStore((s) => s.selectSegment);

  const gateCount = gates.length;

  const runs = React.useMemo(() => {
    const out: { i: number; len: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 1e-4) out.push({ i, len });
    }
    return out;
  }, [points]);

  return (
    <div className="space-y-6">
      <Section label="Material">
        <div className="grid grid-cols-1 gap-1.5">
          {FENCE_MATERIALS.map((m) => {
            const active = material === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMaterial(m)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--r-md)] p-2 pr-3 hairline text-left transition-all",
                  active
                    ? "bg-[color:var(--accent-soft)] ring-2 ring-[color:var(--accent)] shadow-[var(--shadow-sm)]"
                    : "hover:bg-black/[0.03]",
                )}
              >
                <span
                  className="h-8 w-8 shrink-0 rounded-[var(--r-sm)] hairline"
                  style={{ background: MATERIAL_SWATCH[m] }}
                />
                <span
                  className={cn(
                    "flex-1 text-[12.5px] font-medium",
                    active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink-soft)]",
                  )}
                >
                  {MATERIAL_LABEL[m]}
                </span>
                {active && <Check className="h-4 w-4 text-[color:var(--accent)]" />}
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Height">
        <div className="flex gap-1.5 flex-wrap">
          {FENCE_HEIGHTS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHeight(h)}
              className={cn(
                "h-9 px-4 rounded-full text-[12px] font-medium hairline transition-colors",
                height === h
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
              )}
            >
              {h} ft
            </button>
          ))}
        </div>
      </Section>

      <Section label="Runs">
        {runs.length === 0 ? (
          <div className="text-[12px] text-[color:var(--ink-muted)]">Draw a fence to see its runs.</div>
        ) : (
          <div className="flex flex-col gap-1">
            {runs.map((r, idx) => {
              const active = selectedSegment === r.i;
              return (
                <button
                  key={r.i}
                  type="button"
                  onClick={() => selectSegment(active ? null : r.i)}
                  className={cn(
                    "flex items-center justify-between rounded-[var(--r-sm)] px-2.5 py-1.5 text-[12px] hairline transition-colors",
                    active
                      ? "bg-[color:var(--accent-soft)] ring-1 ring-[color:var(--accent)] text-[color:var(--accent-ink)]"
                      : "text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
                  )}
                >
                  <span className="font-medium">Run {idx + 1}</span>
                  <span className="tabular text-[color:var(--ink-muted)]">{Math.round(r.len)} ft</span>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section label="Gates">
        <div className="inline-flex items-center rounded-[var(--r-md)] hairline bg-white/60">
          <button
            type="button"
            onClick={() => {
              if (gateCount > 0) removeGate(gates[gates.length - 1].id);
            }}
            disabled={gateCount === 0}
            className="h-9 w-9 grid place-items-center text-[color:var(--ink-muted)] hover:bg-black/[0.04] disabled:opacity-40"
            aria-label="Remove gate"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="w-14 text-center font-display tabular text-[20px]">{gateCount}</div>
          <button
            type="button"
            onClick={() => addGate(selectedSegment ?? runs[0]?.i ?? 0)}
            disabled={runs.length === 0}
            className="h-9 w-9 grid place-items-center text-[color:var(--ink-muted)] hover:bg-black/[0.04] disabled:opacity-40"
            aria-label="Add gate"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {runs.length > 0 && (
          <div className="text-[11px] text-[color:var(--ink-faint)]">
            Adds to {selectedSegment != null ? `the selected run` : `Run 1`}.
          </div>
        )}
      </Section>

      <Section label="Site">
        <button
          type="button"
          role="switch"
          aria-checked={demolition}
          aria-label="Remove existing fence"
          onClick={() => setDemolition(!demolition)}
          className="flex w-full items-center gap-3 py-1 text-left"
        >
          <span
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
              demolition ? "bg-[color:var(--accent)]" : "bg-[color:var(--ink-line)]",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                demolition ? "left-[18px]" : "left-0.5",
              )}
            />
          </span>
          <span className="text-[13px] text-[color:var(--ink-soft)]">Remove existing fence</span>
        </button>
      </Section>
    </div>
  );
}
