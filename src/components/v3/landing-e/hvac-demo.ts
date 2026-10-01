/* THE HVAC HERO WINDOW'S DATA (2026-10-01) — fixtures and a copy of the sums.
   ============================================================
   The `?industry=hvac` landing shows the real HVAC estimator's flow — address,
   house, load, system — on three made-up Seattle-area houses. Nothing here
   calls an API or the database: the figures are computed in the browser from
   this file alone, and they are EXAMPLES (the window says so).

   The sums are a condensed COPY of src/lib/hvac/load.ts (the block load) and
   the Manual S rules in src/lib/hvac/select.ts, kept here on purpose: the
   estimator's engine is the second developer's module and the landing must
   not pull it (or its tables) into the public bundle. Constants are the
   engine's own defaults for the house eras they stand for; the design
   temperatures are the engine's King / Snohomish rows (84 / 26 °F and
   82 / 26 °F). Types are the engine's where one fits. */

import type { DuctLocation, Tightness } from "@/lib/hvac/types";

export type HvacTier = "value" | "mid" | "premium";

export interface DemoHouse {
  id: string;
  /** What is typed into the search field. */
  address: string;
  /** "Kirkland, WA 98033" */
  town: string;
  county: "King" | "Snohomish";
  sqft: number;
  year: number;
  storeys: 1 | 2;
  /** Named zones with their share of the area, for the drawing. */
  zones: Array<{ name: string; share: number }>;
  existing: { label: string; heat: "gas-furnace" | "electric-baseboard" | "heat-pump"; tons: number; age: number };
  ducts: { location: DuctLocation; condition: "good" | "fair" | "poor"; label: string };
  tightness: Tightness;
}

/** Three houses, no real address: Seattle-area streets with made-up numbers. */
export const DEMO_HOUSES: DemoHouse[] = [
  {
    id: "kirkland",
    address: "4418 NE 97th St, Kirkland",
    town: "Kirkland, WA 98033",
    county: "King",
    sqft: 1980,
    year: 1978,
    storeys: 2,
    zones: [
      { name: "Living · kitchen", share: 0.42 },
      { name: "Bedrooms", share: 0.36 },
      { name: "Family room", share: 0.22 },
    ],
    existing: { label: "Gas furnace + 3-ton AC, 2009", heat: "gas-furnace", tons: 3, age: 17 },
    ducts: { location: "crawl", condition: "fair", label: "Ducts in the crawl space, fair" },
    tightness: "leaky",
  },
  {
    id: "shoreline",
    address: "17625 Meridian Ave N, Shoreline",
    town: "Shoreline, WA 98133",
    county: "King",
    sqft: 1420,
    year: 1962,
    storeys: 1,
    zones: [
      { name: "Living · dining", share: 0.48 },
      { name: "Bedrooms", share: 0.52 },
    ],
    existing: { label: "Electric baseboard, no cooling", heat: "electric-baseboard", tons: 0, age: 30 },
    ducts: { location: "none", condition: "good", label: "No ducts — ductless or new runs" },
    tightness: "leaky",
  },
  {
    id: "bothell",
    address: "2213 142nd Pl SE, Bothell",
    town: "Bothell, WA 98012",
    county: "Snohomish",
    sqft: 2640,
    year: 2004,
    storeys: 2,
    zones: [
      { name: "Main floor", share: 0.46 },
      { name: "Upstairs bedrooms", share: 0.38 },
      { name: "Bonus room", share: 0.16 },
    ],
    existing: { label: "Gas furnace + 4-ton AC, 2004", heat: "gas-furnace", tons: 4, age: 22 },
    ducts: { location: "attic", condition: "good", label: "Ducts in the attic, insulated" },
    tightness: "average",
  },
];

export const DEMO_DEFAULT = DEMO_HOUSES[0];

/* ── design conditions (the engine's WA rows) ──────────────── */
const DESIGN: Record<DemoHouse["county"], { coolingF: number; heatingF: number; station: string }> = {
  King: { coolingF: 84, heatingF: 26, station: "Seattle-Tacoma Intl" },
  Snohomish: { coolingF: 82, heatingF: 26, station: "Paine Field" },
};
const INDOOR_COOLING_F = 75;
const INDOOR_HEATING_F = 70;
/** Marine climate: 400 CFM per ton (the engine's "moderate" class). */
const CFM_PER_TON = 400;
const GRAINS = 20;

/* ── envelope by era (the engine's defaults, condensed) ────── */
function envelope(year: number) {
  if (year < 1980) return { wallU: 0.09, ceilU: 0.053, winU: 0.5, shgc: 0.6, wfr: 0.15, ach50: 12, label: "R-11 walls · R-19 attic · double-pane" };
  if (year < 2000) return { wallU: 0.077, ceilU: 0.033, winU: 0.45, shgc: 0.55, wfr: 0.15, ach50: 8, label: "R-13 walls · R-30 attic · double-pane" };
  return { wallU: 0.055, ceilU: 0.026, winU: 0.3, shgc: 0.3, wfr: 0.16, ach50: 5, label: "R-21 walls · R-38 attic · low-E" };
}
const ACH50: Record<Tightness, number> = { leaky: 12, average: 8, tight: 5, "very-tight": 3 };
const DUCT: Record<DuctLocation, { heating: number; cooling: number }> = {
  conditioned: { heating: 0, cooling: 0 },
  attic: { heating: 0.15, cooling: 0.25 },
  crawl: { heating: 0.12, cooling: 0.12 },
  basement: { heating: 0.06, cooling: 0.06 },
  none: { heating: 0, cooling: 0 },
};

export interface DemoLoadPart {
  name: string;
  heating: number;
  cooling: number;
}
export interface DemoLoad {
  parts: DemoLoadPart[];
  heatingBtuh: number;
  coolingBtuh: number;
  /** Cooling tons the load calls for, to the half ton, 1.5 at least. */
  targetTons: number;
  cfm: number;
  coolingF: number;
  heatingF: number;
  station: string;
  envelope: string;
}

const round500 = (v: number) => Math.max(0, Math.round(v / 500) * 500);

/** The block load, the way load.ts does it, on the fixture's era defaults. */
export function demoLoad(h: DemoHouse): DemoLoad {
  const c = DESIGN[h.county];
  const e = envelope(h.year);
  const dtH = INDOOR_HEATING_F - c.heatingF;
  const dtC = c.coolingF - INDOOR_COOLING_F;
  const footprint = h.sqft / h.storeys;
  const perimeter = 4.1 * Math.sqrt(footprint);
  const ceiling = 8;
  const windowSqft = h.sqft * e.wfr;
  const doorSqft = 40 * Math.min(2, h.storeys);
  const netWall = Math.max(0, perimeter * ceiling * h.storeys - windowSqft - doorSqft);
  const ach = ACH50[h.tightness] / (h.storeys >= 2 ? 17 : 20);
  const infilCfm = (ach * h.sqft * ceiling) / 60;
  const occupants = 3;
  // Window solar: a quarter each way at the engine's bearing gains (25/110/50/110).
  const solar = windowSqft * 0.25 * (25 + 110 + 50 + 110) * (e.shgc / 0.87) * 0.75;

  const parts: DemoLoadPart[] = [
    { name: "Windows", heating: e.winU * windowSqft * dtH, cooling: e.winU * windowSqft * dtC + solar },
    { name: "Walls & doors", heating: e.wallU * netWall * dtH + 0.4 * doorSqft * dtH, cooling: e.wallU * netWall * (dtC + 8) + 0.4 * doorSqft * (dtC + 8) },
    { name: "Ceiling", heating: e.ceilU * footprint * dtH, cooling: e.ceilU * footprint * (dtC + 12) },
    { name: "Floor", heating: 0.05 * footprint * dtH, cooling: 0.02 * footprint * dtC },
    { name: "Air leakage", heating: 1.1 * infilCfm * dtH, cooling: 1.1 * infilCfm * dtC + 0.68 * infilCfm * GRAINS },
    { name: "People & appliances", heating: 0, cooling: occupants * 430 + 1200 },
  ];
  let heat = parts.reduce((a, p) => a + p.heating, 0);
  let cool = parts.reduce((a, p) => a + p.cooling, 0);
  const d = DUCT[h.ducts.location];
  const dh = h.ducts.condition === "poor" ? d.heating * 1.5 : d.heating;
  const dc = h.ducts.condition === "poor" ? d.cooling * 1.5 : d.cooling;
  if (dh > 0 || dc > 0) {
    parts.push({ name: `Ducts in the ${h.ducts.location}`, heating: heat * dh, cooling: cool * dc });
    heat *= 1 + dh;
    cool *= 1 + dc;
  }
  const heatingBtuh = round500(heat);
  const coolingBtuh = round500(cool);
  const targetTons = Math.max(1.5, Math.round((coolingBtuh / 12000) * 2) / 2);
  return {
    parts: parts.map((p) => ({ ...p, heating: Math.round(p.heating), cooling: Math.round(p.cooling) })),
    heatingBtuh,
    coolingBtuh,
    targetTons,
    cfm: Math.round(((coolingBtuh / 12000) * CFM_PER_TON) / 10) * 10,
    coolingF: c.coolingF,
    heatingF: c.heatingF,
    station: c.station,
    envelope: e.label,
  };
}

/* ── the system: tiers, sizes, efficiencies, price ─────────── */

/** The three sales tiers, as the shop's pick list has them. No maker named:
 *  the landing describes a class of equipment, not a brand. */
export const TIERS: Record<HvacTier, { name: string; seer2: number; hspf2: number; staging: "single" | "two-stage" | "variable"; coldClimate: boolean; blurb: string; perTon: number; indoor: number }> = {
  value: { name: "Good", seer2: 15.2, hspf2: 7.8, staging: "single", coldClimate: false, blurb: "Single-stage heat pump, standard air handler", perTon: 1650, indoor: 1900 },
  mid: { name: "Better", seer2: 17.0, hspf2: 8.5, staging: "two-stage", coldClimate: false, blurb: "Two-stage heat pump, variable-speed blower", perTon: 2250, indoor: 2600 },
  premium: { name: "Best", seer2: 20.0, hspf2: 9.5, staging: "variable", coldClimate: true, blurb: "Variable-capacity cold-climate heat pump, communicating thermostat", perTon: 3100, indoor: 3400 },
};
export const TIER_ORDER: HvacTier[] = ["value", "mid", "premium"];

/** SEER2 steps the window lets the visitor try; the tier sets the default. */
export const SEER_STEPS = [15.2, 17.0, 18.5, 20.0] as const;
export const SEER_FLOOR = 14.3; // the national SEER2 floor for a split system (the engine's rule table)

export interface DemoSystem {
  tier: HvacTier;
  tons: number;
  seer2: number;
  hspf2: number;
  /** "Carries the house to 26 °F" / "Backup below 31 °F". */
  heatNote: string;
  /** Manual S: capacity against the cooling load, as a percentage. */
  fitPct: number;
  fitOk: boolean;
  equipment: number;
  labor: number;
  ducts: number;
  electrical: number;
  permit: number;
  total: number;
  /** The year's heating and cooling bill, before and after. Examples. */
  billBefore: number;
  billAfter: number;
  savings: number;
  lines: Array<[string, string]>;
}

const WA_LABOR = 1.15; // the landing's Washington factor, as the other shots use
const GAS_PER_THERM = 1.45;
const KWH = 0.13;
/** Seattle: heating degree days (base 65) and full-load cooling hours. */
const HDD = 4600;
const COOL_HOURS = 320;

function heatPumpCapacityAt(tons: number, coldClimate: boolean, outdoorF: number): number {
  const base = tons * 12000;
  const p17 = base * (coldClimate ? 0.8 : 0.65);
  if (outdoorF >= 47) return base;
  if (outdoorF >= 17) return p17 + ((base - p17) * (outdoorF - 17)) / 30;
  return p17 * 0.85;
}

/** Price, fit and the year's bill for a tier at a size and SEER2. The SEER
 *  override moves the equipment price up the tier's own ladder. */
export function demoSystem(h: DemoHouse, load: DemoLoad, tier: HvacTier, tons: number, seer2: number): DemoSystem {
  const t = TIERS[tier];
  const seerLift = (seer2 - t.seer2) * 180 * tons; // ~$180 per SEER2 point per ton, either way
  const equipment = Math.round((t.perTon * tons + t.indoor + seerLift) / 10) * 10;
  const ductWork = h.ducts.location === "none" ? 2400 : h.ducts.condition === "poor" ? 1800 : h.ducts.condition === "fair" ? 900 : 350;
  const electrical = h.existing.heat === "electric-baseboard" ? 1150 : 650;
  const permit = 290;
  const laborHrs = (h.ducts.location === "none" ? 26 : 18) + tons * 2;
  const labor = Math.round(laborHrs * 95 * WA_LABOR);
  const total = Math.round((equipment + labor + ductWork + electrical + permit) / 10) * 10;

  const capacity = tons * 12000;
  const fitPct = Math.round((capacity / load.coolingBtuh) * 100);
  const upper = t.staging === "variable" ? 135 : 125; // heating governs in this climate (select.ts)
  const fitOk = fitPct >= 90 && fitPct <= upper;
  const atDesign = heatPumpCapacityAt(tons, t.coldClimate, load.heatingF);
  let heatNote: string;
  if (atDesign >= load.heatingBtuh) heatNote = `Carries the house at ${load.heatingF} °F, no backup`;
  else {
    // The balance point: where the pump's falling capacity meets the rising load.
    let bp = load.heatingF;
    for (let f = load.heatingF; f <= 65; f += 1) {
      const need = (load.heatingBtuh * (65 - f)) / (65 - load.heatingF);
      if (heatPumpCapacityAt(tons, t.coldClimate, f) >= need) { bp = f; break; }
    }
    heatNote = `${Math.round((atDesign / load.heatingBtuh) * 100)}% at ${load.heatingF} °F · backup below ${bp} °F`;
  }

  // The year's bill: heating energy from the load and the degree days, cooling
  // from full-load hours; before = what is there, after = this system.
  const heatBtuYear = (load.heatingBtuh / (INDOOR_HEATING_F - load.heatingF)) * 24 * HDD;
  const coolBtuYear = load.coolingBtuh * COOL_HOURS;
  const before =
    h.existing.heat === "gas-furnace"
      ? (heatBtuYear / 0.8 / 100000) * GAS_PER_THERM + (h.existing.tons ? (coolBtuYear / 10 / 1000) * KWH : 0)
      : h.existing.heat === "electric-baseboard"
        ? (heatBtuYear / 3412) * KWH
        : (heatBtuYear / 7000) * KWH + (coolBtuYear / 14 / 1000) * KWH;
  const after = (heatBtuYear / (t.hspf2 * 1000 * Math.max(1, seer2 / t.seer2) ** 0.35)) * KWH + (coolBtuYear / seer2 / 1000) * KWH;
  // To the dollar: a SEER2 step moves the cooling side by tens of dollars,
  // and the switch has to be seen to move the bill.
  const billBefore = Math.round(before);
  const billAfter = Math.round(after);

  const money = (n: number) => `$${n.toLocaleString("en-US")}`;
  return {
    tier,
    tons,
    seer2,
    hspf2: Math.round((t.hspf2 + Math.max(0, seer2 - t.seer2) * 0.25) * 10) / 10,
    heatNote,
    fitPct,
    fitOk,
    equipment,
    labor,
    ducts: ductWork,
    electrical,
    permit,
    total,
    billBefore,
    billAfter,
    savings: Math.max(0, billBefore - billAfter),
    lines: [
      [`${tons}-ton heat pump, ${seer2} SEER2`, money(equipment)],
      [h.ducts.location === "none" ? "Duct runs, new" : "Duct sealing & repair", money(ductWork)],
      ["Electrical & disconnect", money(electrical)],
      [`Labor, ${laborHrs} hrs`, money(labor)],
      ["Permit & load report", money(permit)],
    ],
  };
}

/** What Washington offers, as the engine's rule table has it on its
 *  verification date — the window states it, never quotes it. */
export const WA_INCENTIVES = {
  state: "WA",
  lines: [
    { k: "Utility heat-pump rebate", v: "typical $800–$1,500", note: "example — confirmed at quote time" },
    { k: "State HEAR rebate", v: "announced, not open", note: "late 2026 · not quoted" },
    { k: "Federal 25C credit", v: "ended 2025", note: "no credit on a 2026 install" },
  ],
};

export const fmtBtuh = (n: number) => `${n.toLocaleString("en-US")} BTU/h`;
export const fmtMoney = (n: number) => `$${n.toLocaleString("en-US")}`;
