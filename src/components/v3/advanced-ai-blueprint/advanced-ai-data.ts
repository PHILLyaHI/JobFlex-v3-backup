// Advanced AI (Smart Proposal) blueprint — the donor script's embedded demo
// data, hardcoded exactly as authored in
// jobflex-smart-proposal-blueprint_4.html. Every label, number, unit and
// sentence is the donor's; nothing is generated, sorted or reformatted.
//
// It lives in its own module for the same reason the sibling ports do it:
// the behavior file stays readable, and the fixture is one obvious place to
// swap for real data later.

export type ProjectType = { id: string; label: string; icon: string };

/**
 * A materials / labor line item.
 *
 * `id` is the identity the AI refine round-trips (see `refineAdvancedEstimate`
 * rule 6), so a renamed row stays the same row and keeps its price and product
 * link. The product fields below are the live-pricing metadata the estimator
 * attaches to materials — they are carried, unmodified, all the way into the
 * converted proposal's LineItems, which is what makes the proposal's Materials
 * Request view shoppable. `link` is derived from `productUrl`.
 */
export type Line = {
  id: string;
  name: string;
  qty: number;
  unit: string;
  price: number;
  link: boolean;
  store?: string;
  productUrl?: string;
  imageUrl?: string;
  dimensions?: string;
  notes?: string;
};

export type Seed = {
  scope: string;
  assumptions: string[];
  materials: Line[];
  labor: Line[];
};

export const PROJECT_TYPES: ProjectType[] = [
  { id: 'roof',    label: 'Roofing',     icon: 'i-roof' },
  { id: 'fence',   label: 'Fencing',     icon: 'i-fence' },
  { id: 'deck',    label: 'Decking',     icon: 'i-jobs' },
  { id: 'siding',  label: 'Siding',      icon: 'i-building' },
  { id: 'gutters', label: 'Gutters',     icon: 'i-box' },
  { id: 'other',   label: 'Other work',  icon: 'i-pen' }
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

/**
 * The donor's demo estimate.
 *
 * NO LONGER ON THE LIVE PATH: "Generate estimate" now calls
 * `generateAdvancedEstimate`, which brings its own AI-disabled placeholder (and
 * the studio labels that one as sample data). Kept because it is the donor's,
 * and deleting a block of the reference fixture is the owner's call, not a side
 * effect of wiring the estimator up.
 */
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

// REMOVED: `STAGES`.
//
// It was the donor's four-line generation narration, ticked on a fixed 620ms
// interval — "Pricing materials…" then "Costing labor…" then "Writing scope…"
// announced whether or not the pipeline had reached any of them. Once
// "Generate estimate" became a real `generateAdvancedEstimate` call that
// reports no progress, that ticker was theatre laid over a real request: it
// claimed a step the server may not have started, and on a slow call it fell
// silent on "Writing scope…" for the rest of the wait.
//
// The console now narrates only boundaries it actually observes — the intake
// gate, then the estimate — and puts a live elapsed-seconds counter on the
// button (which is not an aria-live region, so a screen reader is not read a
// new number every second). See `startElapsed` in advanced-ai-behavior.ts.
