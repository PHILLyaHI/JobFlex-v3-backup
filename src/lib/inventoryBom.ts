// A PROPOSAL'S LINES AS THE WAREHOUSE COUNTS THEM (2026-09-20).
//
// The fence estimator sells a fence as one line per run — "Cedar privacy —
// 6' fence package · 104 ln ft" — while the warehouse holds posts, rails,
// pickets and concrete. Reading that line back through the estimator's own
// takeoff turns it into the components it was priced from, so stock,
// forecasts and the crew's list count boards and bags, never "packages".
// Roof and HVAC lines are already components and pass through unchanged.
// Pure: the fence takeoff is arithmetic.

import { FENCE_TYPES } from "@/lib/fence/catalog";
import { computeFenceTakeoff, type FenceLayoutInput, type FenceOpeningInput } from "@/lib/fence/takeoff";
import type { StockLine, TradeId } from "@/lib/inventory";

const BOM_UNIT: Record<string, string> = { ea: "each", lf: "linear ft", bag: "bag", box: "box", gal: "gal" };

/** A bill-of-materials label without its job-specific tail: "Concrete · 60 lb bags (holes 30" deep)" → "Concrete · 60 lb bags". */
export function bomItemName(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

const PACKAGE = /^(.+?) — (\d+(?:\.\d+)?)' fence package$/;
const GATE = /^(single|double) gate\b/i;

/** The fence type a package line names, by the label the estimator printed. */
export function fenceTypeForLine(name: string): { id: (typeof FENCE_TYPES)[number]["id"]; heightFt: number } | null {
  const m = PACKAGE.exec(name.trim());
  if (!m) return null;
  const t = FENCE_TYPES.find((ft) => ft.label === m[1]);
  return t ? { id: t.id, heightFt: Number(m[2]) } : null;
}

/** The components a fence's package and gate lines were priced from. */
export function fenceComponents(lines: readonly StockLine[]): StockLine[] {
  const out: StockLine[] = [];
  const openings: FenceOpeningInput[] = [];
  for (const l of lines) {
    const g = GATE.exec(l.name.trim());
    if (g) {
      const variant = g[1].toLowerCase() as "single" | "double";
      for (let i = 0; i < Math.max(1, Math.round(l.quantity)); i++) openings.push({ widthFt: variant === "double" ? 10 : 4, kind: "gate", label: l.name, variant });
    }
  }
  let packages = 0;
  for (const l of lines) {
    const t = fenceTypeForLine(l.name);
    if (!t || !(l.quantity > 0)) {
      if (!GATE.test(l.name.trim())) out.push(l);
      continue;
    }
    packages++;
    const layout: FenceLayoutInput = { type: t.id, heightFt: t.heightFt, runs: [{ lengthFt: l.quantity, corners: 2 }], openings: packages === 1 ? openings : [], terrain: "flat", wastePct: 10 };
    try {
      for (const b of computeFenceTakeoff(layout).bom) out.push({ name: bomItemName(b.label), quantity: b.qty, unit: BOM_UNIT[b.unit] ?? b.unit });
    } catch {
      out.push(l);
    }
  }
  // A gate with no package line on the proposal still needs its posts.
  if (!packages && openings.length) for (const l of lines) if (GATE.test(l.name.trim())) out.push(l);
  return out;
}

/** The lines the warehouse counts for a proposal of this trade. */
export function explodeLines(trade: TradeId | string | null | undefined, lines: readonly StockLine[]): StockLine[] {
  return trade === "fence" ? fenceComponents(lines) : [...lines];
}
