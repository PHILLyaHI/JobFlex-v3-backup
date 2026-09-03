/**
 * Specialty → PriceBook category routing + material-profile prompt injection.
 *
 * Two jobs:
 *   1. Tell the prompt formatter WHICH PriceBook categories matter for the
 *      selected specialty so we stop sending the entire 87-item catalog on
 *      every estimate (a kitchen remodel doesn't need ROOFING; a roofing
 *      job doesn't need APPLIANCE).
 *   2. When `lib/ai/materials.ts` has a hand-curated SpecialtyMaterialProfile
 *      for the specialty (only 26 of the 229 specialties have one today),
 *      format it into a prompt block so GPT anchors to specific products and
 *      vendor price ranges instead of the generic PriceBook averages.
 *
 *  Design notes:
 *  - The specialty-id mapping is the precise path. The category-fallback
 *    is the wide-net path used when an id isn't in the explicit map. A
 *    null return means "no filter — send everything", preserving the
 *    pre-change behaviour for unknown specialty ids.
 *  - This file imports nothing from the route. It's pure data + helpers
 *    so it stays safe for tests and offline tooling.
 */

import { getMaterialProfile } from './materials';
import type { MaterialCategory } from './PriceBook';

/** SpecialtyCategoryId from `lib/ai/specialties.ts` (literal type, not imported
 *  to avoid pulling the whole 2,800-line specialties module into prompt code). */
export type SpecialtyCategoryId = 'interior' | 'exterior' | 'mechanical' | 'general' | 'specialty';

/** Per-specialty precise routing. Each list is ordered by relevance — the
 *  formatter doesn't currently care about order, but downstream code might. */
const SPECIALTY_TO_PRICE_CATEGORIES: Record<string, MaterialCategory[]> = {
  // Mechanical
  'electrical':                ['ELECTRICAL', 'GENERAL'],
  'plumbing':                  ['PLUMBING', 'GENERAL'],
  'hvac':                      ['HVAC', 'ELECTRICAL', 'GENERAL'],
  'fire-protection':           ['PLUMBING', 'ELECTRICAL', 'GENERAL'],
  'security-lowvoltage':       ['ELECTRICAL', 'GENERAL'],
  'low-voltage':               ['ELECTRICAL', 'GENERAL'],

  // Exterior
  'roofing':                   ['ROOFING', 'LUMBER', 'GENERAL'],
  'roofing-contractor':        ['ROOFING', 'LUMBER', 'GENERAL'],
  'siding':                    ['LUMBER', 'PAINT', 'GENERAL'],
  'siding-installation':       ['LUMBER', 'PAINT', 'GENERAL'],
  'windows':                   ['LUMBER', 'GENERAL'],
  'doors':                     ['LUMBER', 'GENERAL'],
  'gutter-installation':       ['ROOFING', 'GENERAL'],
  'fascia':                    ['LUMBER', 'PAINT', 'GENERAL'],
  'decking':                   ['LUMBER', 'GENERAL'],
  'fencing':                   ['LUMBER', 'CONCRETE', 'GENERAL'],

  // Interior finishes
  'drywall':                   ['LUMBER', 'PAINT', 'GENERAL'],
  'painting':                  ['PAINT', 'GENERAL'],
  'trim':                      ['LUMBER', 'PAINT', 'GENERAL'],
  'flooring-installation':     ['TILE_FLOORING', 'LUMBER', 'GENERAL'],
  'tile-installation':         ['TILE_FLOORING', 'GENERAL'],
  'tile-stone':                ['TILE_FLOORING', 'GENERAL'],
  'carpeting':                 ['TILE_FLOORING', 'GENERAL'],

  // Surface & decor
  'cabinetry':                 ['CABINETS', 'LUMBER', 'GENERAL'],
  'countertops':               ['CABINETS', 'GENERAL'],
  'epoxy-flooring':            ['EPOXY_FLOORING', 'CONCRETE', 'GENERAL'],

  // Whole-room remodels span many categories on purpose
  'kitchen-remodel':           ['CABINETS', 'APPLIANCE', 'PLUMBING', 'ELECTRICAL', 'PAINT', 'TILE_FLOORING', 'LUMBER', 'GENERAL'],
  'bathroom-remodel':          ['PLUMBING', 'TILE_FLOORING', 'PAINT', 'ELECTRICAL', 'CABINETS', 'LUMBER', 'GENERAL'],
  'whole-house-remodel':       ['LUMBER', 'CABINETS', 'PAINT', 'TILE_FLOORING', 'PLUMBING', 'ELECTRICAL', 'HVAC', 'GENERAL'],

  // Core building trades
  'concrete-contractor':       ['CONCRETE', 'LUMBER', 'GENERAL', 'RENTAL'],
  'concrete-resurfacing':      ['CONCRETE', 'EPOXY_FLOORING', 'GENERAL'],
  'framing-contractor':        ['LUMBER', 'GENERAL'],
  'masonry':                   ['CONCRETE', 'LUMBER', 'GENERAL'],
  'excavation-grading':        ['CONCRETE', 'RENTAL', 'GENERAL'],
  'foundation-retaining':      ['CONCRETE', 'LUMBER', 'GENERAL', 'RENTAL'],
  'structural-steel':          ['LUMBER', 'GENERAL'],

  // Site & landscape
  'landscaping':               ['CONCRETE', 'LUMBER', 'GENERAL', 'RENTAL'],
  'hardscape':                 ['CONCRETE', 'GENERAL'],
  'irrigation':                ['PLUMBING', 'GENERAL'],

  // Envelope
  'insulation-weatherization': ['LUMBER', 'GENERAL'],
  'waterproofing':             ['CONCRETE', 'PAINT', 'GENERAL'],

  // Specialty systems
  'solar':                     ['ELECTRICAL', 'ROOFING', 'GENERAL'],
  'pool-spa':                  ['CONCRETE', 'PLUMBING', 'ELECTRICAL', 'GENERAL'],

  // General contracting
  'general-contracting':       ['LUMBER', 'GENERAL', 'RENTAL'],
  'restoration':               ['LUMBER', 'PAINT', 'TILE_FLOORING', 'GENERAL'],

  // Service / repair
  'appliance-repair':          ['APPLIANCE', 'GENERAL'],
  'pest-control':              ['GENERAL'],
  'snow-removal':              ['RENTAL', 'GENERAL'],
};

/** Wide-net fallback when the specific specialty id isn't in the precise map.
 *  Keys are the SpecialtyCategoryId values from `lib/ai/specialties.ts`. */
const CATEGORY_TO_PRICE_CATEGORIES: Record<SpecialtyCategoryId, MaterialCategory[]> = {
  interior:   ['LUMBER', 'PAINT', 'TILE_FLOORING', 'CABINETS', 'GENERAL'],
  exterior:   ['ROOFING', 'LUMBER', 'CONCRETE', 'PAINT', 'GENERAL'],
  mechanical: ['ELECTRICAL', 'PLUMBING', 'HVAC', 'GENERAL'],
  general:    ['LUMBER', 'CONCRETE', 'GENERAL', 'RENTAL'],
  specialty:  ['GENERAL', 'RENTAL', 'CONCRETE'],
};

/** Resolve the PriceBook categories that should be injected into the GPT prompt
 *  for a given specialty. Returns null when the specialty is unknown — null
 *  means "no filter, send the whole PriceBook" (preserving prior behaviour). */
export function priceBookCategoriesForSpecialty(
  specialtyId: string | null | undefined,
  specialtyCategory: SpecialtyCategoryId | null | undefined,
): MaterialCategory[] | null {
  if (specialtyId) {
    const exact = SPECIALTY_TO_PRICE_CATEGORIES[specialtyId];
    if (exact) return exact;
  }
  if (specialtyCategory) return CATEGORY_TO_PRICE_CATEGORIES[specialtyCategory] ?? null;
  return null;
}

/** US state abbreviations — used by the location → state extractor. */
const US_STATE_ABBRS = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

/** Best-effort extractor that pulls a 2-letter US state code from a free-form
 *  location string. Returns null when no state is recognizable. Examples:
 *    "Lake Stevens, WA"     → 'WA'
 *    "Austin, TX 78701"     → 'TX'
 *    "98258"                → null  (zip-only, no state inference here)
 *    "California"           → null  (we don't expand full names; could later) */
export function extractStateFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const tokens = location.toUpperCase().split(/[\s,]+/);
  for (const tok of tokens) {
    if (tok.length === 2 && US_STATE_ABBRS.has(tok)) return tok;
  }
  return null;
}

/** Build a prompt-injectable block from a curated SpecialtyMaterialProfile.
 *  Returns null when no profile exists for this specialty (the caller should
 *  fall through to the generic PriceBook in that case).
 *
 *  When `userState` is provided, the vendor list is filtered to vendors that
 *  serve that state (or are flagged as 'National') — keeps the AI from
 *  recommending a Sherwin-Williams branch that doesn't operate in the
 *  customer's market. National-coverage vendors (no `states` field set) are
 *  always retained. */
export function formatSpecialtyMaterialProfile(
  specialtyId: string | null | undefined,
  userState?: string | null,
): string | null {
  const profile = getMaterialProfile(specialtyId ?? null);
  if (!profile) return null;

  const stateUpper = userState ? userState.toUpperCase() : null;

  const lines: string[] = [
    `=== SPECIALTY MATERIAL PROFILE: ${profile.specialtyId} ===`,
    '',
    'These are the curated products and vendors for this specialty. Anchor your',
    'estimate to the prices shown here when the project description matches —',
    'the values reflect contractor-grade SKUs we stand behind.',
    '',
  ];

  // Group products by category for readability.
  const byCat: Record<string, typeof profile.products> = {};
  for (const p of profile.products) {
    (byCat[p.category] = byCat[p.category] || []).push(p);
  }
  const order: Array<keyof typeof byCat> = ['core', 'consumable', 'optional', 'equipment'];
  for (const cat of order) {
    const items = byCat[cat as string];
    if (!items?.length) continue;
    lines.push(`${cat.toUpperCase()}:`);
    for (const p of items) {
      const range = p.priceRange ? `$${p.priceRange[0]}–$${p.priceRange[1]}` : 'price varies';
      const cov = p.coverageSqFt ? `, covers ${p.coverageSqFt} sq ft` : '';
      lines.push(`  - ${p.name} (${p.unit}, ${range}${cov})`);
      if (p.description) lines.push(`      ${p.description}`);
    }
    lines.push('');
  }

  // State-aware vendor filtering: keep vendors whose `states` includes the
  // user's state, or whose `regions` includes 'National', or that have no
  // `states`/`regions` set (treated as national-scope by default).
  const visibleVendors = profile.vendors.filter(v => {
    if (!stateUpper) return true;
    const hasNational = (v.regions ?? []).some(r => /national/i.test(r));
    if (hasNational) return true;
    if (!v.states && !v.regions) return true;
    if (v.states?.includes(stateUpper)) return true;
    return false;
  });

  if (visibleVendors.length) {
    const header = stateUpper && visibleVendors.length < profile.vendors.length
      ? `VENDORS available in ${stateUpper} (filtered from ${profile.vendors.length} total):`
      : 'VENDORS (for sourcing notes only — pricing is per-product above):';
    lines.push(header);
    for (const v of visibleVendors.slice(0, 5)) {
      const lead = v.leadTime ? ` — ${v.leadTime}` : '';
      lines.push(`  - ${v.name}${lead}`);
    }
    lines.push('');
  }

  lines.push('=== END SPECIALTY MATERIAL PROFILE ===');
  return lines.join('\n');
}

// Test-only export so we can assert the map covers the specialties we care about.
export const __FOR_TESTS = { SPECIALTY_TO_PRICE_CATEGORIES, CATEGORY_TO_PRICE_CATEGORIES };
