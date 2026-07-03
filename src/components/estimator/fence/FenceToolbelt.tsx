"use client";
// Sandbox control rail — material / height / site. Presentational: reads and writes
// the studio store, no business logic. Material is shown as real colour swatches
// (built-ins + any custom materials the user created in the pricing card). Runs and
// openings live in the FenceLedger; this rail is just the fence's build spec.
import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFenceStudioStore } from "@/stores/useFenceStudioStore";
import {
  FENCE_MATERIALS,
  FENCE_HEIGHTS,
  MIN_HEIGHT_FT,
  MAX_HEIGHT_FT,
  materialLabel,
  materialColor,
} from "./fenceTypes";

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
  const demolition = useFenceStudioStore((s) => s.spec.demolition);
  const customMaterials = useFenceStudioStore((s) => s.customMaterials);
  const setMaterial = useFenceStudioStore((s) => s.setMaterial);
  const setHeight = useFenceStudioStore((s) => s.setHeight);
  const setDemolition = useFenceStudioStore((s) => s.setDemolition);

  const materials: string[] = [...FENCE_MATERIALS, ...customMaterials.map((m) => m.id)];

  return (
    <div className="space-y-6">
      <Section label="Material">
        <div className="grid grid-cols-1 gap-1.5">
          {materials.map((m) => {
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
                  style={{ background: materialColor(m, customMaterials) }}
                />
                <span
                  className={cn(
                    "flex-1 text-[12.5px] font-medium",
                    active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink-soft)]",
                  )}
                >
                  {materialLabel(m, customMaterials)}
                </span>
                {active && <Check className="h-4 w-4 text-[color:var(--accent)]" />}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[color:var(--ink-faint)]">Create your own materials in “Your pricing” below.</p>
      </Section>

      <Section label="Height">
        <div className="flex items-center gap-1.5 flex-wrap">
          {FENCE_HEIGHTS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHeight(h)}
              className={cn(
                "h-9 px-3.5 rounded-full text-[12px] font-medium hairline transition-colors",
                height === h
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
              )}
            >
              {h} ft
            </button>
          ))}
          <HeightInput value={height} onCommit={setHeight} />
        </div>
        <p className="text-[11px] text-[color:var(--ink-faint)]">Taller fence raises the price per foot.</p>
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

// Custom height entry. Uncontrolled so typing doesn't fight the store; commits
// clamped to a sane range on blur/Enter. `key={value}` reshows the latest committed
// value without a sync effect. Highlights when the height isn't a quick-pick.
function HeightInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const isCustom = !FENCE_HEIGHTS.includes(value);

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return;
    onCommit(Math.min(MAX_HEIGHT_FT, Math.max(MIN_HEIGHT_FT, n)));
  };

  return (
    <span
      className={cn(
        "inline-flex h-9 w-[76px] items-center gap-1 rounded-full px-3 hairline transition-colors focus-within:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]",
        isCustom ? "bg-[color:var(--ink)] text-[color:var(--paper)]" : "bg-white/60",
      )}
    >
      <input
        key={value}
        defaultValue={String(value)}
        inputMode="decimal"
        aria-label="Custom height in feet"
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={cn(
          "min-w-0 flex-1 bg-transparent text-[12px] font-medium tabular-nums outline-none",
          isCustom ? "text-[color:var(--paper)]" : "text-[color:var(--ink)]",
        )}
      />
      <span className={cn("text-[11px]", isCustom ? "text-[color:var(--paper)]/70" : "text-[color:var(--ink-faint)]")}>
        ft
      </span>
    </span>
  );
}
