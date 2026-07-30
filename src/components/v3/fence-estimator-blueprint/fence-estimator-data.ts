// Fence estimator blueprint — the donor's demo fixtures, hardcoded exactly as
// they appear in jobflex-fence-estimator-blueprint_7.html's <script>
// (MATERIALS / HEIGHTS / OPENINGS / DEMO_PER_FT). Every id, label, rate, width
// and swatch colour is the donor's literal value: they drive the ticket maths,
// the ledger rows and the Gate / Door popovers, so a single changed number
// would change what the page renders.

export type Material = {
  id: string;
  label: string;
  base: number;
  color: string;
};

export type HeightOption = {
  ft: number;
  mult: number;
};

export type OpeningType = {
  id: string;
  kind: string;
  label: string;
  width: number;
  price: number;
};

export const MATERIALS: Material[] = [
  { id: 'cedar',      label: 'Cedar',      base: 28, color: '#b88420' },
  { id: 'vinyl',      label: 'Vinyl',      base: 40, color: '#e8e6e0' },
  { id: 'chain-link', label: 'Chain-link', base: 18, color: '#94a3b8' },
  { id: 'aluminum',   label: 'Aluminum',   base: 55, color: '#475569' },
  { id: 'composite',  label: 'Composite',  base: 48, color: '#7c5a3a' }
];

export const HEIGHTS: HeightOption[] = [
  { ft: 4, mult: 0.78 },
  { ft: 6, mult: 1.0 },
  { ft: 7, mult: 1.18 },
  { ft: 8, mult: 1.4 }
];

export const OPENINGS: OpeningType[] = [
  { id: 'single', kind: 'gate', label: 'Single gate', width: 4,  price: 350 },
  { id: 'double', kind: 'gate', label: 'Double gate', width: 8,  price: 850 },
  { id: 'triple', kind: 'gate', label: 'Triple gate', width: 12, price: 1150 },
  { id: 'arched', kind: 'gate', label: 'Arched gate', width: 4,  price: 600 },
  { id: 'solid',  kind: 'door', label: 'Solid door',  width: 3,  price: 280 },
  { id: 'slatted',kind: 'door', label: 'Slatted door',width: 3,  price: 340 }
];

/** Teardown + haul rate, per linear foot. Annotated `number` (not left as the
 *  literal `6`) so the donor's arithmetic and comparisons against other
 *  numbers compile unchanged. */
export const DEMO_PER_FT: number = 6;
