// Mobile Smart Proposal (mobile-advanced-ai-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop donor fixture
// (src/components/v3/advanced-ai-blueprint/advanced-ai-data.ts) so the handheld
// composition is judged against exactly the same content as the desktop sheet:
// same labels, same numbers, same units, same sentences, same field names.
//
// Two deliberate differences, both forced and both local to this file:
//
//  1. PROJECT_TYPES icon ids. The desktop sprite carries `i-box` and `i-pen`;
//     the shared handheld sprite (components/v3/mobile-shell/sprite.tsx) does
//     not, and a page may not add symbols to it. Those two rows therefore point
//     at this page's own `i-advanced-ai-*` symbols, which draw the identical
//     lucide glyphs. Every other value in the array is the donor's.
//
//  2. CITIES / matchCities are NEW. The desktop wires the location field to
//     Google Places (blueprint-shell/places-suggest). Network calls of any kind
//     are out of scope for this build, so the suggestion list is a local
//     Seattle-area gazetteer filtered client-side — same affordance, same
//     "picking a suggestion also fills the State field" behaviour, no endpoint.
//
// This is a design surface: no Prisma, no server actions. The line arrays are
// mutated at runtime (edit / add / remove / refine), so the component clones
// this seed per mount via cloneSeed().

export type ProjectType = { id: string; label: string; icon: string };

/** A materials / labor line item. `link` renders the "Retail link" affordance. */
export type Line = { id: string; name: string; qty: number; unit: string; price: number; link: boolean };

export type Seed = {
  scope: string;
  assumptions: string[];
  materials: Line[];
  labor: Line[];
};

/** Which of the two ledgers a line belongs to. */
export type Group = "materials" | "labor";

export const PROJECT_TYPES: ProjectType[] = [
  { id: 'roof',    label: 'Roofing',     icon: 'i-roof' },
  { id: 'fence',   label: 'Fencing',     icon: 'i-fence' },
  { id: 'deck',    label: 'Decking',     icon: 'i-jobs' },
  { id: 'siding',  label: 'Siding',      icon: 'i-building' },
  { id: 'gutters', label: 'Gutters',     icon: 'i-advanced-ai-box' },
  { id: 'other',   label: 'Other work',  icon: 'i-advanced-ai-pen' }
];

export const STATES: [string, string][] = [
  ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
  ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
  ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
  ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
  ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
  ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
  ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
  ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
  ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
  ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
  ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
];

export const SAMPLES: string[] = [
  'Replace 2400 sqft architectural shingle roof — tear-off, ridge vents, ice & water shield. Bothell, WA.',
  'Install 180 linear ft cedar privacy fence, 7ft tall, one gate, sloped yard.',
  'Rebuild 320 sqft composite deck on existing frame — railings and stairs.',
  'Replace gutters and downspouts on a two-story colonial, add leaf guards.'
];

export const SEED: Seed = {
  scope: 'Tear off existing roofing down to the deck, inspect and replace damaged sheathing as ' +
    'needed, install synthetic underlayment and ice & water shield at eaves and valleys, install ' +
    'architectural shingles with matching ridge cap, add ridge vents, replace pipe boots and ' +
    'flashing, haul away all debris and magnet-sweep the site.',
  assumptions: [
    'Single-story ranch with walkable pitch (6:12 or less)',
    'One layer of existing shingles to remove',
    'Dumpster can be placed on the driveway',
    'Permit fees billed at cost if the city requires one'
  ],
  materials: [
    { id: 'm1', name: 'Architectural shingles — 30 yr', qty: 26, unit: 'square', price: 128, link: true },
    { id: 'm2', name: 'Synthetic underlayment roll', qty: 6, unit: 'roll', price: 92, link: true },
    { id: 'm3', name: 'Ice & water shield', qty: 4, unit: 'roll', price: 118, link: true },
    { id: 'm4', name: 'Ridge vent, 4 ft sections', qty: 12, unit: 'each', price: 21, link: true },
    { id: 'm5', name: 'Drip edge, 10 ft', qty: 18, unit: 'each', price: 14, link: true },
    { id: 'm6', name: 'Roofing nails, coil', qty: 8, unit: 'box', price: 46, link: false },
    { id: 'm7', name: 'Pipe boots + flashing kit', qty: 5, unit: 'each', price: 32, link: true }
  ],
  labor: [
    { id: 'l1', name: 'Tear-off and disposal', qty: 26, unit: 'square', price: 62, link: false },
    { id: 'l2', name: 'Install underlayment and shield', qty: 26, unit: 'square', price: 34, link: false },
    { id: 'l3', name: 'Shingle installation', qty: 26, unit: 'square', price: 118, link: false },
    { id: 'l4', name: 'Flashing, vents and detail work', qty: 1, unit: 'lot', price: 640, link: false },
    { id: 'l5', name: 'Site cleanup and magnet sweep', qty: 1, unit: 'lot', price: 280, link: false }
  ]
};

/** The generation "narration" the console types out, one line per 620ms tick. */
export const STAGES: string[] = ['Reading your brief…', 'Pricing materials…', 'Costing labor…', 'Writing scope…'];

/**
 * The local stand-in for Google Places. Seattle-area contractor texture, the
 * same towns the rest of the fixture set uses (Bothell, Kirkland, Redmond,
 * Kenmore, Everett, Woodinville, Bellevue…). Picking one fills the State field
 * too, exactly as picking a Places suggestion does on the desktop.
 */
export const CITIES: { city: string; state: string }[] = [
  { city: 'Bothell', state: 'WA' },
  { city: 'Kirkland', state: 'WA' },
  { city: 'Redmond', state: 'WA' },
  { city: 'Kenmore', state: 'WA' },
  { city: 'Everett', state: 'WA' },
  { city: 'Woodinville', state: 'WA' },
  { city: 'Bellevue', state: 'WA' },
  { city: 'Sammamish', state: 'WA' },
  { city: 'Mill Creek', state: 'WA' },
  { city: 'Lynnwood', state: 'WA' },
  { city: 'Issaquah', state: 'WA' },
  { city: 'Edmonds', state: 'WA' },
  { city: 'Shoreline', state: 'WA' },
  { city: 'Monroe', state: 'WA' },
  { city: 'Snohomish', state: 'WA' },
  { city: 'Duvall', state: 'WA' }
];

/** Up to four towns whose name contains what has been typed. Prefix hits first. */
export function matchCities(query: string): { city: string; state: string }[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts = CITIES.filter((c) => c.city.toLowerCase().startsWith(q));
  const rest = CITIES.filter(
    (c) => !c.city.toLowerCase().startsWith(q) && c.city.toLowerCase().includes(q),
  );
  const hits = starts.concat(rest).slice(0, 4);
  // An exact single hit is already on the field — nothing left to suggest.
  if (hits.length === 1 && hits[0].city.toLowerCase() === q) return [];
  return hits;
}

/** A fresh, deeply-copied estimate. The module-level SEED is never written through. */
export function cloneSeed(): Seed {
  return {
    scope: SEED.scope,
    assumptions: SEED.assumptions.slice(),
    materials: SEED.materials.map((l) => ({ ...l })),
    labor: SEED.labor.map((l) => ({ ...l })),
  };
}

export function lineTotal(l: Line): number {
  return l.qty * l.price;
}

export function sumOf(list: Line[]): number {
  return list.reduce((a, l) => a + lineTotal(l), 0);
}

/** The label a state code reads back as — "WA", or "" when nothing is picked. */
export function stateCode(code: string): string {
  return STATES.some((s) => s[0] === code) ? code : '';
}
