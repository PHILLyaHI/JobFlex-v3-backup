// Mobile Smart Proposal (mobile-advanced-ai-v2) — static intake content.
//
// What is left in here is the CHROME of the intake wizard: the project-type
// tiles, the state list the picker renders, the four example briefs, and the
// labels the generation narration ticks through. All of it is copy, none of it
// is data.
//
// WHAT WAS REMOVED, AND WHY
//
//  · SEED / cloneSeed / Line / Seed / lineTotal / sumOf — the canned roof
//    estimate this page used to load instead of pricing anything. The surface
//    now calls the real actions (actions/advancedEstimator) and holds its rows
//    in the shared console model (lib/estimate/console-model), which is the
//    only line shape allowed to exist on either surface. A leftover fixture
//    would just be a second one waiting to be picked up by mistake.
//  · CITIES / matchCities — the local Seattle-area gazetteer that stood in for
//    Google Places while network calls were out of scope. The location field
//    has run real Places suggestions through mobile-shell/address-field since
//    2026-07-30.
//  · stateCode — a validator for a value the StatePicker can no longer produce
//    an invalid version of.
//
// The one deliberate difference from the desktop donor is the PROJECT_TYPES
// icon ids. The desktop sprite carries `i-box` and `i-pen`; the shared handheld
// sprite (components/v3/mobile-shell/sprite.tsx) does not, and a page may not
// add symbols to it. Those two rows therefore point at this page's own
// `i-advanced-ai-*` symbols, which draw the identical lucide glyphs.

export type ProjectType = { id: string; label: string; icon: string };

/**
 * The pricing model the estimator is pointed at.
 *
 * "Other work" is not a category — picking it reveals a free-text field whose
 * contents become the `projectType` sent to the AI, so "Skylights" gets priced
 * as skylights rather than as a generic job.
 */
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

/**
 * The generation narration, in the order the pipeline actually works.
 *
 * These are not a script on a timer: the component advances them off the real
 * request (the intake gate returning raises the floor) and HOLDS on the last
 * one until the estimate arrives. Adding a stage here means finding a real
 * checkpoint to hang it on.
 *
 * `dwellMs` is how long a stage may sit before creeping to the next, and 0
 * means "do not creep — wait for a real event". Stage 0 ends when
 * `analyzeEstimatePrompt` resolves and the LAST stage ends when the estimate
 * lands, so both are 0; the two in between are inside one server round trip
 * that reports nothing, so they dwell.
 *
 * The labels are the desktop console's, verbatim — the same four phases of the
 * same pipeline, so a contractor who watched it on a desk sees the same names
 * on a phone. They were 'Costing labor…' / 'Writing scope…' here, which named
 * steps the pipeline does not have as separate phases.
 */
export const STAGES: { label: string; dwellMs: number }[] = [
  { label: 'Reading the brief…', dwellMs: 0 },
  { label: 'Planning materials…', dwellMs: 7000 },
  { label: 'Live pricing…', dwellMs: 14000 },
  { label: 'Building the estimate…', dwellMs: 0 },
];
