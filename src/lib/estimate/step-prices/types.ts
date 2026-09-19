// Smart Proposal — the price book behind every procedure step (2026-09-18).
//
// Owner, after a street sewer and a bathroom came back far too cheap: "all
// specialties that we have need to be addressed as a price creation." The
// procedures (lib/estimate/procedures) say WHICH lines a professional
// estimate itemizes; this book says what each line costs. One entry per AI
// specialty, one price per procedure step, researched from public cost
// guides, bid tabulations and fee schedules (docs/pricing-step-prices.md).
//
// Prices are stored as the sources publish them: what the customer pays a
// licensed contractor per unit, US national average, standard grade, no
// sales tax, the contractor's overhead and profit included. The estimator
// writes lines at the contractor's COST (the org's markup adds overhead and
// profit afterwards), so ./index.ts divides by 1 + `op` before the prompt
// sees a number — except a pass-through fee, which carries no markup.
// Plain data + types.

import type { ProcedureUnit } from "../procedures/types";

export type PriceRange = [number, number];

export type StepPrice = {
  /** Customer price per unit of the step's unit, overhead and profit included. */
  price: PriceRange;
  /** The labor share of the price, 0-1; the rest is material and equipment. */
  labor: number;
  /** A permit, a city or utility charge, a lab fee: passed through, never marked up. */
  fee?: boolean;
  /** Where the number comes from: a source gives it, derived from one, or estimated. */
  basis: "src" | "derived" | "est";
  /** The quantity this step carries on the typical job (core steps), for the check. */
  q?: number;
  note?: string;
};

export type SpecialtyBenchmark = {
  /** The unit the trade sells the whole job by. */
  unit: ProcedureUnit;
  /** What that quantity measures ("fence length", "roof area in squares"). */
  measures: string;
  /** All-in customer price per unit for a whole, typical job (per job when `fixed`). */
  price: PriceRange;
  /** A typical job's size in that unit. */
  typicalQty: PriceRange;
  /** The job size the steps' typical quantities (`q`) were built for — the self-check's job. */
  jobQty?: number;
  /** The smallest total a contractor charges for this work. */
  minJob: number | null;
  sources: string[];
};

export type SpecialtyPrices = {
  /** Overhead and profit over direct cost for the firm that does this work (0.25 = 25%). */
  op: number;
  opNote: string;
  benchmark: SpecialtyBenchmark;
  /** Keyed by the procedure step's item text, exactly as the procedure writes it. */
  steps: Record<string, StepPrice>;
};

export type StepPriceMap = Record<string, SpecialtyPrices>;
