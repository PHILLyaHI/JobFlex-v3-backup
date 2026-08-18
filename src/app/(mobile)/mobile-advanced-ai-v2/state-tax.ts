// STATE SALES-TAX BASE RATES — adapter over the app-wide table.
//
// Drives the Totals card's Tax % field: picking a state in the intake step
// fills the rate, and the contractor can override it. The desktop Smart
// Proposal console fills its Tax field from the same place.
//
// WHY THIS FILE STILL EXISTS
//
// It used to carry its own copy of all 51 rates. `lib/pricing/salesTax` already
// owned that table for the manual proposal builder, so the app had two rate
// tables that could silently disagree — the same job priced on two surfaces
// would tax differently. This file is now a thin unit adapter: salesTax speaks
// FRACTIONS (0.065), this surface's counter speaks PERCENT (6.5). One table,
// two units, no drift.
//
// ── READ THIS BEFORE TRUSTING A NUMBER ─────────────────────────────────────
// These are STATE-LEVEL BASE RATES ONLY. They deliberately exclude county,
// city, transit and special-district add-ons, which in some states carry more
// weight than the state rate itself (Seattle bills ~10.35% against
// Washington's 6.5% base; Chicago ~10.25% against Illinois' 6.25%). The number
// this produces is an ESTIMATING AID, not a filing-accurate figure — which is
// why the field it fills stays editable rather than read-only.
//
// The five states with no state-level sales tax are 0 on purpose, not missing:
// AK, DE, MT, NH, OR. Alaska and Montana still permit local sales tax, so 0 is
// the state floor there rather than the amount actually charged.
//
// Address-accurate rates need a jurisdiction lookup (Avalara / TaxJar) keyed
// on the full address, which is a data-layer change and out of scope here.

import { STATE_SALES_TAX, stateTaxRate } from "@/lib/pricing/salesTax";

/** The shared fractions, expressed as percent for the counter UI. */
export const STATE_TAX_PCT: Record<string, number> = Object.fromEntries(
  Object.entries(STATE_SALES_TAX).map(([code, fraction]) => [
    code,
    // 0.06875 * 100 lands on 6.875000000000001 in binary floating point, and
    // that tail renders in the field. Rates are published to 3 decimals.
    Math.round(fraction * 100 * 1000) / 1000,
  ]),
);

/**
 * The base rate for a state, as a percent, or 0 when nothing is picked yet
 * (the counter's documented resting value) or the code is unknown.
 *
 * Accepts anything `resolveStateCode` accepts — "TX", "tx", "Texas" — so a
 * Places pick that returns a full state name works as well as the picker's
 * two-letter code.
 */
export function stateTaxPct(code: string): number {
  const rate = stateTaxRate(code);
  return rate == null ? 0 : Math.round(rate * 100 * 1000) / 1000;
}
