/**
 * Sales-tax guidance for AI prompt injection.
 *
 * The AI estimator was being asked to emit a `taxRate` field but was never
 * told what value to use — GPT either invented one or omitted it entirely.
 * This module bridges the existing `lib/stateTaxRates.ts` data (state averages
 * + ZIP-prefix lookups) with the city-override list from the user's
 * AI_SALES_TAX_PROMPT.md spec, producing a tight prompt block GPT can act on.
 *
 * Two modes:
 *   - **Resolved**: when we can extract a state or ZIP from the project
 *     location, we hand GPT the SPECIFIC computed rate ("Apply 9.29% to
 *     materials. Source: WA / ZIP 98258"). No table needed; GPT just uses it.
 *   - **Unresolved**: when location is missing or unrecognized, we inject a
 *     compact reference table + the +1.5% local-allowance rule from the
 *     spec, letting GPT pick the right number itself.
 *
 *  Tax base: matches the spec — sales tax applies to MATERIALS ONLY by default.
 *  GPT is told this explicitly so labor isn't double-taxed.
 */

import { getTaxRate, getStateTaxRate } from './stateTaxRates';

/** Base state rates from the AI_SALES_TAX_PROMPT.md spec (statewide statutory
 *  rate without local additions). Used for the reference-table fallback when
 *  we can't resolve to a specific location. */
const BASE_STATE_RATES: Record<string, number> = {
  AL: 0.040, AK: 0.000, AZ: 0.056, AR: 0.065, CA: 0.0725, CO: 0.029,
  CT: 0.0635, DE: 0.000, DC: 0.060, FL: 0.060, GA: 0.040, HI: 0.040,
  ID: 0.060, IL: 0.0625, IN: 0.070, IA: 0.060, KS: 0.065, KY: 0.060,
  LA: 0.0445, ME: 0.055, MD: 0.060, MA: 0.0625, MI: 0.060, MN: 0.06875,
  MS: 0.070, MO: 0.04225, MT: 0.000, NE: 0.055, NV: 0.0685, NH: 0.000,
  NJ: 0.06625, NM: 0.050, NY: 0.040, NC: 0.0475, ND: 0.050, OH: 0.0575,
  OK: 0.045, OR: 0.000, PA: 0.060, RI: 0.070, SC: 0.060, SD: 0.040,
  TN: 0.070, TX: 0.0625, UT: 0.061, VT: 0.060, VA: 0.053, WA: 0.065,
  WV: 0.060, WI: 0.050, WY: 0.040,
};

/** High-impact city/metro overrides — combined state + county + city rates. */
interface CityOverride {
  patterns: RegExp[];
  state: string;
  rate: number;
  label: string;
}
const CITY_OVERRIDES: CityOverride[] = [
  { patterns: [/\bchicago\b/i],                        state: 'IL', rate: 0.1025,  label: 'Chicago, IL' },
  { patterns: [/\bseattle\b/i, /\bbellevue\b/i],       state: 'WA', rate: 0.1025,  label: 'Seattle / Bellevue, WA' },
  { patterns: [/\blos angeles\b/i, /\bla\b/i],         state: 'CA', rate: 0.0950,  label: 'Los Angeles, CA' },
  { patterns: [/\bnew orleans\b/i],                    state: 'LA', rate: 0.0945,  label: 'New Orleans, LA' },
  { patterns: [/\batlanta\b/i],                        state: 'GA', rate: 0.0890,  label: 'Atlanta, GA' },
  { patterns: [/\bnew york\b/i, /\bmanhattan\b/i, /\bbrooklyn\b/i, /\bqueens\b/i, /\bnyc\b/i], state: 'NY', rate: 0.08875, label: 'New York City, NY' },
  { patterns: [/\bdenver\b/i],                         state: 'CO', rate: 0.0881,  label: 'Denver, CO' },
  { patterns: [/\bsan francisco\b/i, /\bsf\b/i],       state: 'CA', rate: 0.08625, label: 'San Francisco, CA' },
  { patterns: [/\bphoenix\b/i],                        state: 'AZ', rate: 0.0860,  label: 'Phoenix, AZ' },
  { patterns: [/\bdallas\b/i, /\bhouston\b/i, /\baustin\b/i], state: 'TX', rate: 0.0825, label: 'Major Texas Metro (Dallas / Houston / Austin)' },
  { patterns: [/\blas vegas\b/i],                      state: 'NV', rate: 0.08375, label: 'Las Vegas, NV' },
];

const US_STATE_ABBRS = new Set(Object.keys(BASE_STATE_RATES));

export interface ResolvedTaxRate {
  /** Combined rate as a decimal (e.g., 0.0825 for 8.25%). */
  rate: number;
  /** The display string GPT should use in the line-item label. */
  label: string;
  /** What we resolved against (zip / city / state / fallback). */
  source: 'city-override' | 'zip-lookup' | 'state-lookup' | 'unresolved';
}

function extractZip(location: string): string | null {
  const m = location.match(/\b(\d{5})(-\d{4})?\b/);
  return m ? m[1] : null;
}

function extractStateAbbr(location: string): string | null {
  const tokens = location.toUpperCase().split(/[\s,]+/);
  for (const tok of tokens) {
    if (tok.length === 2 && US_STATE_ABBRS.has(tok)) return tok;
  }
  return null;
}

/** Resolve a project location to a tax rate. Returns null when nothing is
 *  resolvable; caller should inject the reference table instead. */
export function resolveTaxRate(location: string | null | undefined): ResolvedTaxRate | null {
  if (!location || location.trim().length < 2) return null;

  // 1. City override wins — highest impact, most likely to be wrong if
  //    we use the state average alone.
  for (const city of CITY_OVERRIDES) {
    if (city.patterns.some(p => p.test(location))) {
      return { rate: city.rate, label: city.label, source: 'city-override' };
    }
  }

  // 2. ZIP-based lookup using the existing detailed table.
  const zip = extractZip(location);
  if (zip) {
    const zipRate = getTaxRate(zip, null);
    if (zipRate > 0) {
      return { rate: zipRate, label: `ZIP ${zip}`, source: 'zip-lookup' };
    }
  }

  // 3. State average (combined state + average local).
  const state = extractStateAbbr(location);
  if (state) {
    const stateRate = getStateTaxRate(state);
    if (stateRate > 0) {
      return { rate: stateRate, label: `${state} (state average)`, source: 'state-lookup' };
    }
    // State exists but rate is 0 (OR/MT/NH/AK/DE) — that's a real answer.
    if (state in BASE_STATE_RATES) {
      return { rate: 0, label: `${state} (no statewide sales tax)`, source: 'state-lookup' };
    }
  }

  return null;
}

/** Format a compact reference table — used when the location is unresolvable. */
function formatReferenceTable(): string {
  const lines: string[] = [
    'STATE BASE RATES (use as fallback when you cannot pin down the city):',
  ];
  // Group rates onto fewer lines for prompt economy.
  const entries = Object.entries(BASE_STATE_RATES).sort();
  for (let i = 0; i < entries.length; i += 4) {
    const row = entries.slice(i, i + 4)
      .map(([s, r]) => `${s} ${(r * 100).toFixed(2)}%`)
      .join('  ');
    lines.push(`  ${row}`);
  }
  lines.push('');
  lines.push('HIGH-IMPACT METROS (use these instead of state base when applicable):');
  for (const c of CITY_OVERRIDES) {
    lines.push(`  - ${c.label}: ${(c.rate * 100).toFixed(2)}%`);
  }
  return lines.join('\n');
}

export interface BuildOptions {
  /** Project location string — anything from "Lake Stevens, WA 98258" to
   *  "Manhattan" works. null/undefined falls through to reference-table mode. */
  location?: string | null;
  /** Compact mode skips the reference table when no location is given. Use
   *  for token-constrained prompts. */
  compact?: boolean;
}

/** Build the prompt-injectable sales-tax guidance block. Always returns a
 *  non-empty string — even with no location, GPT gets actionable rules. */
export function buildSalesTaxGuidance({ location, compact }: BuildOptions = {}): string {
  const resolved = resolveTaxRate(location ?? null);

  const lines: string[] = [
    '=== SALES TAX RULES ===',
    '',
    'DO NOT emit a sales-tax line item. The Grand Totals widget computes tax',
    'separately from pricing.taxRate. If you add a "Sales Tax" or "Applicable',
    'tax" line item it will be double-counted on top of the Grand Totals tax row.',
    '',
    'Set pricing.taxRate to the decimal rate (e.g. 0.0825 for 8.25%) and stop.',
    'Tax is applied to materials only, downstream, by the proposal renderer.',
    '',
  ];

  if (resolved) {
    const pct = (resolved.rate * 100).toFixed(2);
    lines.push(`AUTHORITATIVE RATE FOR THIS PROJECT: ${pct}% (${resolved.label})`);
    lines.push(`Use exactly this rate. Do not look up a different one. Set pricing.taxRate = ${resolved.rate.toFixed(4)} (decimal form).`);
    if (resolved.source === 'city-override') {
      lines.push('This is a high-impact metro override that already includes state + county + city tax — do NOT add a local surcharge on top.');
    }
  } else {
    // CRITICAL: do NOT show the metro/state reference table here. When we did,
    // GPT anchored on the first highly-formatted row ("Chicago, IL: 10.25%")
    // and used 10.25% as a "safe default" even for projects in entirely
    // different states. Instead, instruct it to emit 0 tax — the route
    // post-processes the response and sets the authoritative rate based on
    // the user's billing address, or surfaces a disclaimer when none was
    // provided. The model never has to guess.
    lines.push('NO LOCATION SUPPLIED.');
    lines.push('Set pricing.taxRate = 0 and DO NOT invent a percentage.');
    lines.push('Server-side post-processing will inject the correct rate from the customer\'s billing address.');
    void compact; // option retained for API symmetry; unused now that fallback is uniform.
  }

  lines.push('');
  lines.push('=== END SALES TAX RULES ===');
  return lines.join('\n');
}

// Re-export so route handlers can use the same resolver for post-processing
// without importing internal helpers.
export { formatReferenceTable as __formatReferenceTableForTests };

/** Result of forcing a known tax rate onto an AI-generated estimate. */
export interface TaxOverrideResult {
  appliedRate: number;
  /** What we did: 'forced-from-location' when we resolved the rate and
   *  overrode the AI; 'zeroed-no-location' when no location was available
   *  and we had to set 0; 'kept-as-is' when there was nothing to do
   *  (rare — defensive). */
  action: 'forced-from-location' | 'zeroed-no-location' | 'kept-as-is';
  /** What the AI had originally — useful for telemetry / debugging. */
  originalRate: number | null;
  /** Human-readable label matching the resolution source, e.g. "Chicago, IL". */
  label: string | null;
  /** Number of tax-looking line items we stripped out (GPT often emits a
   *  "Sales Tax" line item even when told not to — we remove them so the
   *  Grand Totals tax row doesn't double-count). */
  strippedTaxLineItems: number;
}

/** Heuristic: does this line item look like a sales-tax row that we need
 *  to strip? Matches names like "Sales tax", "Applicable sales tax",
 *  "Tax — materials", "VAT", etc. Errs on the side of stripping rather
 *  than leaving a duplicate — false negatives let double-counting through. */
function looksLikeTaxLineItem(item: { name?: string; description?: string } | null | undefined): boolean {
  if (!item) return false;
  const text = `${item.name ?? ''} ${item.description ?? ''}`.toLowerCase().trim();
  if (!text) return false;
  // Must mention "tax" — anchors the regex so we don't strip e.g. "tax-credit material".
  if (!/\btax(?:able|es|ation)?\b/.test(text)) return false;
  // Common patterns we want to catch.
  return /\bsales\s*tax\b/.test(text)
    || /\bapplicable\s+(sales\s+)?tax\b/.test(text)
    || /\btax\s+on\s+materials?\b/.test(text)
    || /\bmaterial\s+tax\b/.test(text)
    || /\b(local|state|city|county)\s+(sales\s+)?tax\b/.test(text)
    // Built with fromCharCode: a literal em-dash character class in source was read by Tailwind as an arbitrary class and broke the stylesheet.
    || new RegExp("^tax[ ]*[-:" + String.fromCharCode(8212) + "]").test(text)
    || /\bvat\b/.test(text);
}

/** Strip tax-looking line items from the estimate. Mutates the estimate
 *  in-place and returns the count removed. Handles both the category
 *  structure (`line_items: [{ category, items: [...] }]`) and the flat
 *  structure (`line_items: [{ name, description, ... }]`). */
function stripTaxLineItems(estimate: any): number {
  let removed = 0;
  const lineItems = estimate?.line_items ?? estimate?.lineItems;
  if (!Array.isArray(lineItems)) return 0;

  for (const entry of lineItems) {
    if (entry && Array.isArray(entry.items)) {
      const before = entry.items.length;
      entry.items = entry.items.filter((it: any) => !looksLikeTaxLineItem(it));
      removed += before - entry.items.length;
    }
  }
  // Flat-array case: filter the top-level array.
  if (lineItems.length > 0 && !lineItems[0]?.items) {
    const before = lineItems.length;
    const filtered = lineItems.filter((it: any) => !looksLikeTaxLineItem(it));
    removed += before - filtered.length;
    if (estimate.line_items) estimate.line_items = filtered;
    if (estimate.lineItems) estimate.lineItems = filtered;
  }
  return removed;
}

// Test-only export
export const __looksLikeTaxLineItemForTests = looksLikeTaxLineItem;

/** Force the authoritative tax rate onto an AI-generated estimate, regardless
 *  of what the model put in `pricing.taxRate`. This is the post-processing
 *  guardrail that catches the case where GPT ignores the prompt and emits
 *  a hallucinated rate (most commonly 10.25%, anchored from the metro list
 *  it used to see in the prompt).
 *
 *  Mutates `estimate` in place (matching the existing convention used by
 *  `validateEstimateAgainstPriceBook`) and returns a summary. Also
 *  appends a disclaimer to `estimate.disclaimers` when no location was
 *  provided so the contractor knows to confirm the rate manually. */
export function applyAuthoritativeTax(
  estimate: any,
  location: string | null | undefined,
): TaxOverrideResult {
  const pricing = estimate?.pricing;
  if (!pricing || typeof pricing !== 'object') {
    return {
      appliedRate: 0,
      action: 'kept-as-is',
      originalRate: null,
      label: null,
      strippedTaxLineItems: 0,
    };
  }
  const originalRate = typeof pricing.taxRate === 'number' ? pricing.taxRate : null;
  const resolved = resolveTaxRate(location);

  // Strip any AI-emitted tax line items first. The Grand Totals widget
  // computes tax from pricing.taxRate, so a "Sales Tax" line item would
  // double-count.
  const strippedTaxLineItems = stripTaxLineItems(estimate);

  if (resolved) {
    pricing.taxRate = resolved.rate;
    pricing._taxRateSource = {
      action: 'forced-from-location',
      label: resolved.label,
      source: resolved.source,
      originalAiRate: originalRate,
      strippedTaxLineItems,
    };
    return {
      appliedRate: resolved.rate,
      action: 'forced-from-location',
      originalRate,
      label: resolved.label,
      strippedTaxLineItems,
    };
  }

  // No location — zero out tax and add a disclaimer so the contractor
  // notices the gap before sending the proposal.
  pricing.taxRate = 0;
  pricing._taxRateSource = {
    action: 'zeroed-no-location',
    label: null,
    source: null,
    originalAiRate: originalRate,
    strippedTaxLineItems,
  };
  const disclaimers: string[] = Array.isArray(estimate.disclaimers) ? estimate.disclaimers : [];
  const note = 'Sales tax not calculated — billing-address state was not provided. Verify your local rate before sending this proposal.';
  if (!disclaimers.includes(note)) disclaimers.push(note);
  estimate.disclaimers = disclaimers;

  return {
    appliedRate: 0,
    action: 'zeroed-no-location',
    originalRate,
    label: null,
    strippedTaxLineItems,
  };
}
