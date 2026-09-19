// Installed unit prices for underground utility work — sewer, storm, water
// (researched 2026-09-18; sources and methodology in docs/pricing-sources.md).
//
// National ranges come from public bid tabulations, state DOT average unit
// prices, the EPA's sewer cost curve and consumer cost guides; Seattle-area
// ranges from WSDOT's Unit Bid Analysis for its Northwest Region (King,
// Snohomish, Skagit, Whatcom, Island, contracts 2023-2026), Western
// Washington city awards (Renton, Federal Way, Puyallup, Mercer Island) and
// 2026 SPU, SDOT and King County fees. Bid prices already carry the
// bidder's overhead and profit. Check: the owner's "300 LF of sewer in a
// city street runs about $300,000" — Renton's 2024 award was $1,041/LF and
// the EPA curve gives about $1,120/LF at 300 LF. Plain data, no imports.
//
// The estimator writes lines at the contractor's cost and the org's markup
// adds overhead and profit (2026-09-18), so every bid price here is shown
// to the model less the bidder's overhead and profit (UTILITY_BID_OP); a
// fee passes through as it is.

/** Overhead and profit inside a public-works bid price: about 15%. */
export const UTILITY_BID_OP = 0.15;

/** A bid price as the contractor's cost. */
export const bidToCost = (n: number) => n / (1 + UTILITY_BID_OP);

export type UtilityJobId =
  | "side-sewer-yard"
  | "side-sewer-to-street"
  | "sewer-main-street"
  | "storm-street"
  | "water-main-street"
  | "water-service-yard";

export type UtilityJobSpec = {
  label: string;
  /** Installed $ per linear ft, all-in. */
  national: [number, number];
  seattle: [number, number];
  /** Optional floor for a very short run: [low, high] job total. */
  minJob?: [number, number];
  note?: string;
};

export const UTILITY_JOBS: Record<UtilityJobId, UtilityJobSpec> = {
  "side-sewer-yard": {
    label: "side sewer in a yard (4-6 in. PVC, 3-6 ft deep)",
    national: [60, 250],
    seattle: [120, 350],
  },
  "side-sewer-to-street": {
    label: "side sewer from the house to the main in the street",
    national: [150, 450],
    seattle: [350, 900],
    note: "Blended over the whole run; the street segment alone runs 150-600 $/LF nationally and 500-1,400 $/LF in the Seattle area (about $20,000-60,000 for the street part there).",
  },
  "sewer-main-street": {
    label: "sewer main in a city street (8-12 in., with manholes, reconnections and street restoration)",
    national: [350, 1100],
    seattle: [800, 1600],
    note: "Deep (over 15 ft), arterial or groundwater jobs run 2,000-3,200 $/LF in the Seattle area; runs over 2,000 LF fall to 500-800 $/LF.",
  },
  "storm-street": {
    label: "storm drain in a street (12-24 in.)",
    national: [200, 600],
    seattle: [350, 900],
  },
  "water-main-street": {
    label: "water main in a street (6-12 in.)",
    national: [250, 600],
    seattle: [450, 1000],
    note: "Short runs (about 300 LF) sit at the high end.",
  },
  "water-service-yard": {
    label: "water service line in a yard",
    national: [50, 150],
    seattle: [75, 250],
  },
};

export type UtilityComponent = {
  item: string;
  unit: string;
  /** null when the price is a Seattle-area fee with no national figure. */
  national: [number, number] | null;
  seattle: [number, number];
  basis: string;
};

export const UTILITY_COMPONENTS: UtilityComponent[] = [
  { item: "Trench excavation and backfill, 0-5 ft deep", unit: "linear ft", national: [15, 40], seattle: [40, 85], basis: "derived" },
  { item: "Trench excavation and backfill, 5-10 ft deep", unit: "linear ft", national: [25, 60], seattle: [95, 185], basis: "derived" },
  { item: "Trench excavation and backfill, 10-15 ft deep", unit: "linear ft", national: [45, 110], seattle: [180, 350], basis: "derived" },
  { item: "Shoring or trench safety system", unit: "linear ft", national: [2, 15], seattle: [10, 50], basis: "bid" },
  { item: "Controlled-density fill backfill", unit: "cu yard", national: [165, 300], seattle: [165, 400], basis: "bid" },
  { item: "PVC sewer pipe 6 in., supplied and laid with bedding", unit: "linear ft", national: [55, 125], seattle: [90, 225], basis: "bid" },
  { item: "PVC sewer pipe 8 in., supplied and laid with bedding", unit: "linear ft", national: [70, 150], seattle: [92, 225], basis: "bid" },
  { item: "Sewer pipe 12 in. PVC or ductile iron, supplied and laid", unit: "linear ft", national: [100, 200], seattle: [140, 275], basis: "bid and derived" },
  { item: "Ductile iron water main 8-12 in., supplied and laid", unit: "linear ft", national: [85, 280], seattle: [170, 410], basis: "bid" },
  { item: "Storm pipe 12 in. RCP, PVC or DI, supplied and laid", unit: "linear ft", national: [60, 150], seattle: [70, 185], basis: "bid" },
  { item: "Storm pipe 24 in. RCP, supplied and laid", unit: "linear ft", national: [100, 220], seattle: [150, 300], basis: "bid and derived" },
  { item: "Precast manhole 48 in., 0-10 ft", unit: "unit", national: [3400, 13000], seattle: [4650, 15000], basis: "bid" },
  { item: "Manhole depth beyond its base height", unit: "vertical ft", national: [100, 400], seattle: [100, 400], basis: "bid, low confidence" },
  { item: "Sewer cleanout", unit: "unit", national: [900, 2500], seattle: [900, 4560], basis: "bid" },
  { item: "Side sewer or service reconnected to the new main", unit: "unit", national: [450, 7500], seattle: [1500, 7500], basis: "bid" },
  { item: "New connection to an existing main or manhole", unit: "unit", national: [3000, 13500], seattle: [2500, 10250], basis: "bid" },
  { item: "Seattle SPU new 3/4 in. water service: tap plus water and sewer connection charges", unit: "unit", national: null, seattle: [14300, 15675], basis: "fee" },
  { item: "King County sewage capacity charge on a new connection (15-year total)", unit: "unit", national: null, seattle: [14038, 14038], basis: "fee" },
  { item: "Saw-cut asphalt", unit: "linear ft", national: [1.5, 3], seattle: [4, 6.5], basis: "bid" },
  { item: "Remove asphalt pavement", unit: "sq yard", national: [8, 22], seattle: [20, 96], basis: "bid; national corrected 2026-09-18: $3-5 was a highway-scale price" },
  { item: "Permanent full-depth HMA trench patch", unit: "sq yard", national: [40, 150], seattle: [70, 200], basis: "bid" },
  { item: "Grind and overlay, plane and 2 in. HMA", unit: "sq yard", national: [10, 25], seattle: [16, 45], basis: "bid and derived" },
  { item: "Flaggers", unit: "hour", national: [45, 80], seattle: [60, 110], basis: "bid; national estimated" },
  { item: "Traffic control lane closure: two flaggers, devices and a supervisor", unit: "day", national: [1000, 2000], seattle: [1400, 2900], basis: "derived" },
  { item: "Bypass pumping, 4-12 in.", unit: "day", national: [500, 5650], seattle: [1000, 8000], basis: "bid; Seattle derived; national high corrected 2026-09-18 (the $15,000 rested on one 12 in. quote)" },
  { item: "Dewatering, sump to wellpoint", unit: "day", national: [300, 2500], seattle: [500, 3500], basis: "estimate" },
  { item: "CCTV inspection after construction", unit: "linear ft", national: [1, 3], seattle: [2, 6], basis: "bid; Seattle derived" },
  { item: "Air or mandrel testing with TV", unit: "linear ft", national: [5, 17], seattle: [14, 17], basis: "bid" },
  { item: "Mobilization", unit: "% of the job", national: [5, 10], seattle: [5, 10], basis: "bid" },
  { item: "Right-of-way or street-use permit", unit: "permit", national: [100, 500], seattle: [1768, 5000], basis: "fee; Seattle upper bound unverified" },
  { item: "Side sewer permit", unit: "permit", national: [100, 500], seattle: [500, 1200], basis: "consumer" },
  { item: "CIPP lining 8 in., the trenchless alternative", unit: "linear ft", national: [42, 60], seattle: [125, 160], basis: "bid; Seattle engineer's estimate with service seals" },
  { item: "Gate valve 6-12 in.", unit: "unit", national: [2600, 11000], seattle: [4000, 5250], basis: "bid" },
  { item: "Fire hydrant assembly", unit: "unit", national: [7450, 16000], seattle: [8150, 12000], basis: "bid; Seattle upper bound estimated" },
];

const money = (n: number) => (n < 10 && !Number.isInteger(n) ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString("en-US")}`);
const span = ([a, b]: [number, number], unit: string) =>
  unit === "% of the job" ? `${a}-${b}% of the job` : a === b ? `${money(a)}/${unit}` : `${money(a)}-${money(b)}/${unit}`;

const isFee = (c: UtilityComponent) => c.basis.startsWith("fee") || /\bpermit\b/i.test(c.item);
const asCost = (c: UtilityComponent, r: [number, number]): [number, number] =>
  isFee(c) || c.unit === "% of the job" ? r : [bidToCost(r[0]), bidToCost(r[1])];

/**
 * One anchor line per component, at contractor cost (a fee as charged) —
 * the trade profile's and the price block's.
 */
export function utilityAnchorLines(): string[] {
  return UTILITY_COMPONENTS.map((c) =>
    c.national
      ? `${c.item}: ${span(asCost(c, c.national), c.unit)} national, ${span(asCost(c, c.seattle), c.unit)} Seattle area`
      : `${c.item}: ${span(c.seattle, c.unit)} (Seattle-area fee)`,
  );
}
