"use client";
import * as React from "react";
import { cn } from "@/lib/cn";
import { money } from "@/lib/format";

interface RatioSliderProps {
  total: number;
  materialPct: number;
  onChange: (next: { materialCost: number; laborCost: number }) => void;
}

const SNAPS = [25, 50, 75];
const SNAP_TOLERANCE = 2.5;

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function RatioSlider({ total, materialPct, onChange }: RatioSliderProps) {
  const disabled = total <= 0;
  const pct = clamp(disabled ? 50 : materialPct, 0, 100);
  const matAmount = disabled ? 0 : round2((total * pct) / 100);
  const labAmount = disabled ? 0 : round2(total - matAmount);

  const trackRef = React.useRef<HTMLDivElement>(null);
  const draggingRef = React.useRef(false);
  const [animating, setAnimating] = React.useState(true);

  const commit = React.useCallback(
    (nextPct: number) => {
      if (disabled) return;
      const clamped = clamp(nextPct, 0, 100);
      const newMat = round2((total * clamped) / 100);
      const newLab = round2(total - newMat);
      onChange({ materialCost: newMat, laborCost: newLab });
    },
    [disabled, total, onChange],
  );

  const pctFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return pct;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return pct;
    return clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
  };

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setAnimating(false);
    commit(pctFromClientX(e.clientX));
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    e.preventDefault();
    commit(pctFromClientX(e.clientX));
  }

  function onPointerEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setAnimating(true);
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {}
    const final = pctFromClientX(e.clientX);
    for (const s of SNAPS) {
      if (Math.abs(final - s) <= SNAP_TOLERANCE) {
        commit(s);
        return;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 1;
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
      commit(100);
    }
  }

  const transition = animating ? "width 150ms cubic-bezier(0.22,1,0.36,1), left 150ms cubic-bezier(0.22,1,0.36,1)" : "none";

  return (
    <div className={cn("space-y-2", disabled && "opacity-60 select-none")}>
      {/* Live readout */}
      <div className="flex items-center justify-between text-[10.5px] tabular">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
          <span className="font-medium text-[color:var(--ink-soft)]">
            {pct.toFixed(0)}% MAT
          </span>
          <span className="text-[color:var(--ink-muted)]">·</span>
          <span className="text-[color:var(--ink-muted)]">{money(matAmount)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[color:var(--ink-muted)]">{money(labAmount)}</span>
          <span className="text-[color:var(--ink-muted)]">·</span>
          <span className="font-medium text-[color:var(--ink-soft)]">
            {(100 - pct).toFixed(0)}% LAB
          </span>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "#C89450" }} />
        </div>
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        role="slider"
        aria-label="Material to labor cost ratio"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
        className={cn(
          "relative h-3 touch-none rounded-full focus:outline-none",
          disabled ? "cursor-not-allowed" : "cursor-ew-resize",
          "focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/40",
        )}
      >
        {/* Base track */}
        <div className="absolute inset-0 rounded-full bg-black/[0.04] dark:bg-white/[0.05] pointer-events-none" />

        {/* Material segment */}
        <div
          className="absolute top-0 bottom-0 left-0 rounded-l-full pointer-events-none"
          style={{
            width: `${pct}%`,
            transition,
            background: "linear-gradient(90deg, rgba(31,122,82,0.35), rgba(31,122,82,0.62))",
          }}
        />

        {/* Labor segment */}
        <div
          className="absolute top-0 bottom-0 right-0 rounded-r-full pointer-events-none"
          style={{
            width: `${100 - pct}%`,
            transition,
            background: "linear-gradient(90deg, rgba(200,148,80,0.45), rgba(200,148,80,0.65))",
          }}
        />

        {/* Snap ticks */}
        {SNAPS.map((s) => (
          <span
            key={s}
            aria-hidden
            className="absolute top-1/2 -translate-y-1/2 h-1 w-px bg-white/70 pointer-events-none"
            style={{ left: `${s}%` }}
          />
        ))}

        {/* Handle */}
        <div
          className="absolute h-[18px] w-[14px] rounded-full pointer-events-none"
          style={{
            left: `${pct}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            transition,
            background: "#ffffff",
            boxShadow:
              "0 0 0 1px rgba(17,17,19,0.18), 0 4px 12px -2px rgba(17,17,19,0.22)",
          }}
        />
      </div>

      {disabled && (
        <p className="text-[10.5px] text-[color:var(--ink-muted)] leading-relaxed">
          Enter material and labor to rebalance.
        </p>
      )}
    </div>
  );
}
