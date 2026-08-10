// LINE-ITEM LAB — the one contract every variant implements.
//
// Three competing designs of card 03 (the priced work) from the manual proposal
// builder at /dashboard/manual-blueprint. They are compared on one page,
// /dashboard/manual-lines, driven by ONE piece of state — so the props below
// are not a suggestion. A variant that invents its own prop shape cannot be
// dropped into the comparison, and cannot later be dropped into the builder.
//
// This file is pure types plus one derived helper. No React, no CSS, no state.
// It is written once, by the orchestrator, and the variant agents IMPORT it.
// Nobody edits it — a change here breaks the other two variants silently.

import type { Line, Unit } from "../manual-focus/manual-focus-types";

export type { Line, Unit };

/**
 * Exactly the props the shipped `LineItems` takes today, so a winning variant
 * is a one-line import swap in manual-blueprint-content.tsx.
 *
 * `openIds` / `onToggle` model per-row disclosure. A variant that has no
 * disclosure (everything on one row) still receives them and may ignore both —
 * that is cheaper than three different prop shapes, and it keeps the comparison
 * page honest, because every variant is fed identical state.
 */
export type LineItemsProps = {
  lines: Line[];

  /** Rows whose detail is currently revealed. Ignore if the variant has none. */
  openIds: string[];
  onToggle: (id: string) => void;

  onPatch: (id: string, patch: Partial<Line>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;

  /** Sum of the named rows, pre-markup. The card's foot figure. */
  baseTotal: number;
  namedCount: number;
  /** Rows with no name: priced, but excluded from every total and never printed. */
  unnamedCount: number;

  taxPct: number;
  taxAuto: boolean;
  /** Two-letter state code the rate was estimated from; "" once set by hand. */
  taxState: string;
  onTaxPct: (n: number) => void;
};

/** Every variant is this shape. The lab page holds an array of them. */
export type LineItemsVariant = (props: LineItemsProps) => React.ReactNode;

/* ============================================================
   THE MATERIAL / LABOR SPLIT — required in every variant
   ============================================================

   `materialCost` + `laborCost` ARE the unit price; there is no third stored
   field. So the split has two independent halves a user might want to move:

     · the unit PRICE   — how much the line costs per unit, total;
     · the RATIO        — how that price divides between material and labor.

   `applyUnitPrice(line, n)`     rescales BOTH halves around the current ratio,
                                 so changing the price never changes the mix.
   `applyMaterialShare(line, p)` moves the ratio while holding the unit price
                                 constant, so changing the mix never changes
                                 the price.

   Both live in ../manual-focus/manual-focus-math. Use them; do not do the
   arithmetic inline. A variant that writes `materialCost` and `laborCost`
   directly from a slider will drift the unit price by rounding on every drag.

   THE REQUIREMENT: the ratio control must be present in ALL THREE variants and
   must be reachable without leaving the row's own context. Where it sits is the
   design question each variant answers differently — that IS the comparison.
*/

/** Convenience for a ratio control's label. 0–100, material's share. */
export function splitLabel(materialPct: number): string {
  const m = Math.round(materialPct);
  return `${m}% material · ${100 - m}% labor`;
}
