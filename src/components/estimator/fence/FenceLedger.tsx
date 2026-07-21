"use client";
// The run / gate / door summary, as one editorial ledger instead of three stacked
// column-lists. A totals strip up top; a hairline-ruled table of runs (click a row
// to highlight that run in 3D); then the openings, each with a styled variant
// picker (built-in + custom types), its width, and its per-unit price off the
// editable rate card. Placement itself happens with the Add tools on the map.
import * as React from "react";
import { createPortal } from "react-dom";
import { DoorOpen, DoorClosed, X, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFenceStudioStore } from "@/stores/useFenceStudioStore";
import { OPENING_PRICE } from "./fencePricing";
import {
  GATE_VARIANTS,
  DOOR_VARIANTS,
  presetWidthFt,
  variantLabel,
  isDetached,
  type OpeningKind,
  type OpeningVariant,
  type CustomOpening,
} from "./fenceTypes";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function resolveWidth(kind: OpeningKind, variant: OpeningVariant, custom: CustomOpening[]): number {
  return custom.find((o) => o.id === variant)?.widthFt ?? presetWidthFt(kind, variant);
}

export function FenceLedger() {
  const points = useFenceStudioStore((s) => s.spec.points);
  const gates = useFenceStudioStore((s) => s.spec.gates);
  const selectedSegment = useFenceStudioStore((s) => s.spec.selectedSegment);
  const pricing = useFenceStudioStore((s) => s.pricing);
  const customOpenings = useFenceStudioStore((s) => s.customOpenings);
  const selectSegment = useFenceStudioStore((s) => s.selectSegment);
  const updateGate = useFenceStudioStore((s) => s.updateGate);
  const removeGate = useFenceStudioStore((s) => s.removeGate);

  const runs = React.useMemo(() => {
    const out: { i: number; len: number }[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      if (b.gap) continue; // run break — no fence between these points
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > 1e-4) out.push({ i, len });
    }
    return out;
  }, [points]);

  const totalFt = runs.reduce((s, r) => s + r.len, 0);
  const hasFence = runs.length > 0;
  const runNumber = (seg: number) => {
    const k = runs.findIndex((r) => r.i === seg);
    return k >= 0 ? k + 1 : null;
  };
  const priceOf = (kind: OpeningKind, variant: OpeningVariant) =>
    pricing.openingPrice[kind]?.[variant] ?? OPENING_PRICE[kind]?.[variant] ?? 0;

  const ordered = React.useMemo(
    () => [...gates].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "gate" ? -1 : 1)),
    [gates],
  );

  return (
    <div className="rounded-[var(--r-lg)] bg-[color:var(--paper)] hairline shadow-[var(--shadow-sm)] overflow-hidden">
      {/* Totals strip */}
      <div className="grid grid-cols-3" style={{ gap: 1, background: "var(--ink-line)" }}>
        <Stat label="Total" value={`${Math.round(totalFt)} ft`} accent />
        <Stat label="Runs" value={String(runs.length)} />
        <Stat label="Openings" value={String(gates.length)} />
      </div>

      {!hasFence ? (
        <div className="px-3 py-4 text-[12px] text-[color:var(--ink-muted)]">
          Draw a fence on the map to see its runs, then use Add gate / Add door on the map to drop openings.
        </div>
      ) : (
        <>
          <LedgerHead>Runs</LedgerHead>
          <div className="divide-y divide-[color:var(--ink-line)]">
            {runs.map((r, idx) => {
              const active = selectedSegment === r.i;
              return (
                <button
                  key={r.i}
                  type="button"
                  onClick={() => selectSegment(active ? null : r.i)}
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left transition-colors",
                    active ? "bg-[color:var(--accent-soft)]" : "hover:bg-[color:var(--paper-deep)]",
                  )}
                >
                  <span
                    className={cn(
                      "text-[13px] font-medium",
                      active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink)]",
                    )}
                  >
                    Run {idx + 1}
                  </span>
                  <span className="tabular-nums text-[12.5px] text-[color:var(--ink-muted)]">{Math.round(r.len)} ft</span>
                </button>
              );
            })}
          </div>

          <LedgerHead>Gates &amp; doors</LedgerHead>
          {ordered.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-[color:var(--ink-muted)]">
              No openings yet. Use Add gate or Add door on the map.
            </div>
          ) : (
            <div className="divide-y divide-[color:var(--ink-line)]">
              {ordered.map((g) => {
                const rn = runNumber(g.segmentIndex);
                const detached = isDetached(g);
                return (
                  <div key={g.id} className="flex items-center gap-2 px-3 py-2">
                    <span
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full",
                        g.kind === "gate"
                          ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)]"
                          : "bg-black/[0.05] text-[color:var(--ink-soft)]",
                      )}
                    >
                      {g.kind === "gate" ? <DoorOpen className="h-3.5 w-3.5" /> : <DoorClosed className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <VariantSelect
                        kind={g.kind}
                        value={g.variant}
                        custom={customOpenings}
                        onChange={(variant) =>
                          updateGate(g.id, { variant, widthFt: resolveWidth(g.kind, variant, customOpenings) })
                        }
                      />
                      <div className="mt-0.5 text-[11px] text-[color:var(--ink-muted)] tabular-nums">
                        {Math.round(g.widthFt)} ft · {detached ? "Free" : rn ? `Run ${rn}` : "—"}
                      </div>
                    </div>
                    <span className="shrink-0 tabular-nums text-[12.5px] font-medium text-[color:var(--ink-soft)]">
                      {usd(priceOf(g.kind, g.variant))}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeGate(g.id)}
                      aria-label="Remove opening"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[color:var(--ink-muted)] hover:bg-black/[0.05] hover:text-[color:var(--rose)]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-white px-3 py-2.5">
      <div className="quiet-caps text-[color:var(--ink-faint)]">{label}</div>
      <div
        className={cn(
          "mt-0.5 text-[17px] font-semibold tabular-nums leading-none",
          accent ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink)]",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function LedgerHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="quiet-caps border-t border-[color:var(--ink-line)] bg-[color:var(--paper-deep)] px-3 py-1.5 text-[color:var(--ink-muted)]">
      {children}
    </div>
  );
}

// Hand-rolled variant picker (project style; no native <select>). The menu is
// portalled to <body> so the ledger card's overflow-hidden can't clip it.
function VariantSelect({
  kind,
  value,
  custom,
  onChange,
}: {
  kind: OpeningKind;
  value: OpeningVariant;
  custom: CustomOpening[];
  onChange: (variant: OpeningVariant) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const options: OpeningVariant[] = [
    ...(kind === "gate" ? GATE_VARIANTS : DOOR_VARIANTS),
    ...custom.filter((o) => o.kind === kind).map((o) => o.id),
  ];

  const place = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 150) });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    place();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-1 rounded-[var(--r-sm)] px-2 h-7 text-[13px] font-medium text-[color:var(--ink)] hairline bg-white/60 hover:bg-white transition-colors"
      >
        <span className="truncate">
          {variantLabel(value, custom)} {kind}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[color:var(--ink-muted)] transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{ position: "fixed", top: rect.top, left: rect.left, width: rect.width, zIndex: 60 }}
            className="max-h-64 overflow-auto rounded-[var(--r-md)] bg-[color:var(--paper)] hairline shadow-[var(--shadow-md)] py-1"
          >
            {options.map((v) => {
              const active = v === value;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    onChange(v);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[13px]",
                    active
                      ? "bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] font-medium"
                      : "text-[color:var(--ink-soft)] hover:bg-black/[0.03]",
                  )}
                >
                  <span className="truncate">
                    {variantLabel(v, custom)} {kind}
                  </span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[color:var(--accent)]" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
