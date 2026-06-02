"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

export type MarkupCategory = "materials" | "labor" | "overhead" | "profit";

const CATEGORY_LABELS: Record<MarkupCategory, string> = {
  materials: "Materials",
  labor: "Labor",
  overhead: "Overhead",
  profit: "Profit",
};

const CATEGORY_FILL: Record<MarkupCategory, string> = {
  materials: "linear-gradient(90deg, rgba(31,122,82,0.30), rgba(31,122,82,0.55))",
  labor: "linear-gradient(90deg, rgba(217,119,6,0.30), rgba(217,119,6,0.55))",
  overhead: "linear-gradient(90deg, rgba(100,116,139,0.30), rgba(100,116,139,0.55))",
  profit: "linear-gradient(90deg, rgba(5,150,105,0.30), rgba(5,150,105,0.55))",
};

const CATEGORY_DOT: Record<MarkupCategory, string> = {
  materials: "#1F7A52",
  labor: "#D97706",
  overhead: "#64748B",
  profit: "#059669",
};

interface MarkupSliderProps {
  category: MarkupCategory;
  value: number;
  onChange: (next: number) => void;
  baseAmount: number;
  computedAmount: number;
  caption?: string;
  max?: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function MarkupSlider({
  category,
  value,
  onChange,
  baseAmount,
  computedAmount,
  caption,
  max = 100,
}: MarkupSliderProps) {
  const pct = clamp(value, 0, max);
  const fillPct = (pct / max) * 100;

  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const [animating, setAnimating] = React.useState(true);

  const commit = React.useCallback(
    (nextValue: number) => {
      onChange(round1(clamp(nextValue, 0, max)));
    },
    [onChange, max],
  );

  const valueFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return pct;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return pct;
    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    return ratio * max;
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setAnimating(false);
    commit(valueFromClientX(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    e.preventDefault();
    commit(valueFromClientX(e.clientX));
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setAnimating(true);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? max / 10 : 0.5;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      commit(pct - step);
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      commit(pct + step);
    } else if (e.key === "Home") {
      e.preventDefault();
      commit(0);
    } else if (e.key === "End") {
      e.preventDefault();
      commit(max);
    }
  }

  const transition = animating
    ? "width 150ms cubic-bezier(0.22,1,0.36,1), left 150ms cubic-bezier(0.22,1,0.36,1)"
    : "none";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[12px]">
        <div className="inline-flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: CATEGORY_DOT[category] }}
          />
          <span className="font-medium text-[color:var(--ink)]">
            {CATEGORY_LABELS[category]}
          </span>
          {caption && (
            <span className="text-[10px] text-[color:var(--ink-muted)] tabular tracking-[0.04em]">
              {caption}
            </span>
          )}
        </div>
        <span className="font-display tabular text-[15px] text-[color:var(--ink)]">
          {pct.toFixed(1)}%
        </span>
      </div>

      <div
        ref={trackRef}
        role="slider"
        aria-label={`${CATEGORY_LABELS[category]} markup`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.round(pct * 10) / 10}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        className={cn(
          "relative h-7 touch-none cursor-ew-resize select-none",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40 rounded-full",
        )}
      >
        {/* Base track */}
        <div className="absolute inset-y-2 left-0 right-0 rounded-full bg-black/[0.06] dark:bg-white/[0.06] pointer-events-none" />

        {/* Filled */}
        <div
          className="absolute inset-y-2 left-0 rounded-full pointer-events-none"
          style={{
            width: `${fillPct}%`,
            transition,
            background: CATEGORY_FILL[category],
          }}
        />

        {/* Handle */}
        <div
          className="absolute top-1/2 h-4 w-4 rounded-full pointer-events-none"
          style={{
            left: `${fillPct}%`,
            transform: "translate(-50%, -50%)",
            transition,
            background: CATEGORY_DOT[category],
            boxShadow:
              "0 0 0 3px rgba(255,255,255,0.95), 0 4px 14px -2px rgba(17,17,19,0.18)",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-[10.5px] text-[color:var(--ink-muted)] tabular pl-3.5">
        <span>{baseAmount > 0 ? `Base ${money(baseAmount)}` : " "}</span>
        <span className={cn(computedAmount !== baseAmount && "text-[color:var(--ink-soft)]")}>
          {computedAmount > 0 ? money(computedAmount) : "—"}
        </span>
      </div>
    </div>
  );
}
