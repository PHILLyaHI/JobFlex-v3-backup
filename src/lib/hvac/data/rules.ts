// HVAC rule tables — data with a date, never recalled by a model.
//
// Every table here carries `verifiedOn` and the source it was read from. The
// proposal prints the date; a reviewer refreshes the table, not the prompt.
// Values are what was verifiable on the date shown; where a figure could not
// be confirmed it is marked `verify` rather than guessed.

import type { CheckStatus, Refrigerant } from "../types";

export const RULES_VERIFIED_ON = "2026-09-15";

// ── refrigerant ─────────────────────────────────────────────────────────────

/**
 * EPA's final rule (effective 2026-07-27) lets R-410A residential split
 * systems manufactured or imported before 2025-01-01 be installed until
 * supplies run out; New York's own law keeps the 2026-01-01 cutoff. New
 * equipment is A2L (R-454B, R-32): higher pressures, leak detection, not a
 * drop-in, and the line set is normally replaced.
 */
export interface RefrigerantRule {
  refrigerant: Refrigerant;
  allowed: boolean;
  status: CheckStatus;
  text: string;
  source: string;
}

export function refrigerantRule(state: string, refrigerant: Refrigerant | undefined): RefrigerantRule {
  const st = state.toUpperCase();
  if (refrigerant === "R-410A") {
    if (st === "NY") {
      return {
        refrigerant,
        allowed: false,
        status: "fix",
        text: "New York bars installing R-410A split systems since 2026-01-01; choose R-454B or R-32 equipment.",
        source: "NY state law codifying the 2026-01-01 deadline; NAHB summary of EPA's 2026 final rule",
      };
    }
    return {
      refrigerant,
      allowed: true,
      status: "verify",
      text:
        "R-410A equipment made or imported before 2025-01-01 may still be installed until stock runs out (EPA final rule effective 2026-07-27). Confirm the unit's manufacture date on the nameplate and the supplier's stock.",
      source: "EPA AIM Act final rule, effective 2026-07-27 (NAHB, ACCA)",
    };
  }
  if (refrigerant === "R-22") {
    return {
      refrigerant,
      allowed: false,
      status: "fix",
      text: "R-22 equipment is no longer manufactured or imported; the system is a replacement, not a repair.",
      source: "EPA HCFC phase-out (2020)",
    };
  }
  if (refrigerant === "R-454B" || refrigerant === "R-32") {
    return {
      refrigerant,
      allowed: true,
      status: "pass",
      text: `${refrigerant} is an A2L refrigerant: new line set unless the existing one is confirmed compatible, leak-detection sensors on the indoor unit, and A2L-rated recovery and charging tools.`,
      source: "EPA technology transition rule (2025); UL 60335-2-40",
    };
  }
  return {
    refrigerant: refrigerant ?? "other",
    allowed: true,
    status: "verify",
    text: "Refrigerant not identified — read it off the nameplate before choosing a line set and tools.",
    source: "",
  };
}

// ── DOE regional efficiency floor (since 2023-01-01) ────────────────────────

export type DoeRegion = "north" | "southeast" | "southwest";

/** The California air districts whose rules bind the installer directly, by
 *  county. South Coast Rule 1111, San Joaquin Valley Rule 4905 and Bay Area
 *  Regulation 9 Rule 4 all cap a residential gas furnace at 14 ng/J; together
 *  these counties are most of the state's population. Verified 2026-09-17. */
const ULN_COUNTIES = new Set([
  // South Coast AQMD (Rule 1111)
  "los angeles", "orange", "riverside", "san bernardino",
  // San Joaquin Valley APCD (Rule 4905)
  "fresno", "kern", "kings", "madera", "merced", "san joaquin", "stanislaus", "tulare",
  // Bay Area AQMD (Reg 9 Rule 4)
  "alameda", "contra costa", "marin", "napa", "san francisco", "san mateo", "santa clara", "solano", "sonoma",
]);

/** Does the job's county sit in a district that takes only 14 ng/J gas heat?
 *  "required" inside one, "confirm" elsewhere in California, "no" outside it. */
export function ultraLowNoxNeeded(state: string, county?: string): "required" | "confirm" | "no" {
  if ((state || "").toUpperCase() !== "CA") return "no";
  const c = (county ?? "").toLowerCase().replace(/\s+county$/, "").trim();
  if (!c) return "confirm";
  return ULN_COUNTIES.has(c) ? "required" : "confirm";
}

/** Counties on salt water, where the makers' coastal builds and sea-coast kits
 *  matter. Florida is treated as coastal throughout. Verified 2026-09-17. */
const COASTAL_COUNTIES: Record<string, Set<string>> = {
  CA: new Set(["del norte", "humboldt", "mendocino", "sonoma", "marin", "san francisco", "san mateo", "santa cruz", "monterey", "san luis obispo", "santa barbara", "ventura", "los angeles", "orange", "san diego"]),
  TX: new Set(["jefferson", "chambers", "galveston", "brazoria", "matagorda", "calhoun", "aransas", "nueces", "kleberg", "willacy", "cameron", "harris"]),
  SC: new Set(["horry", "georgetown", "charleston", "berkeley", "colleton", "beaufort", "jasper"]),
  NC: new Set(["currituck", "dare", "hyde", "carteret", "onslow", "pender", "new hanover", "brunswick", "beaufort", "pamlico"]),
  GA: new Set(["chatham", "bryan", "liberty", "mcintosh", "glynn", "camden"]),
  LA: new Set(["cameron", "vermilion", "iberia", "st. mary", "terrebonne", "lafourche", "jefferson", "plaquemines", "st. bernard", "orleans"]),
};

/** Is the job close enough to salt water that the coastal build is the right call? */
export function coastalSite(state: string, county?: string): boolean {
  const st = (state || "").toUpperCase();
  if (st === "FL" || st === "HI") return true;
  const c = (county ?? "").toLowerCase().replace(/\s+(county|parish)$/, "").trim();
  return !!c && !!COASTAL_COUNTIES[st]?.has(c);
}

export const ULN_DISTRICTS_SOURCE = "South Coast AQMD Rule 1111 Table 1 (amended 2026-01-09); SJVAPCD Rule 4905; BAAQMD Reg 9 Rule 4 §9-4-301.2";

const SOUTHEAST = new Set(["AL", "AR", "DE", "DC", "FL", "GA", "HI", "KY", "LA", "MD", "MS", "NC", "OK", "PR", "SC", "TN", "TX", "VA", "GU", "VI", "MP"]);
const SOUTHWEST = new Set(["AZ", "CA", "NM", "NV"]);

export function doeRegion(state: string): DoeRegion {
  const st = state.toUpperCase();
  if (SOUTHEAST.has(st)) return "southeast";
  if (SOUTHWEST.has(st)) return "southwest";
  return "north";
}

export interface EfficiencyFloor {
  seer2: number;
  eer2?: number;
  hspf2?: number;
  text: string;
  source: string;
  /** Southwest: the EER2 a unit certified at 15.2 SEER2 or better may fall back to. */
  eer2IfHighSeer?: number;
}

/** Minimum a NEW unit may carry in this state, by equipment class. */
export function efficiencyFloor(state: string, kind: "air-conditioner" | "heat-pump", coolingBtuh: number, packaged = false): EfficiencyFloor {
  const region = doeRegion(state);
  const source = "DOE residential central AC and heat pump standards, effective 2023-01-01 (verified 2026-09-17)";
  // A single-package unit answers to one national standard and is enforced on
  // the date it was made, not the date it is installed — the regional split
  // rules below do not reach it.
  if (packaged) {
    return kind === "heat-pump"
      ? { seer2: 13.4, hspf2: 6.7, text: "Single-package heat pumps: 13.4 SEER2 and 6.7 HSPF2 nationwide, enforced by the date of manufacture.", source }
      : { seer2: 13.4, eer2: 11, text: "Single-package air conditioners: 13.4 SEER2 and 11.0 EER2 nationwide, enforced by the date of manufacture.", source };
  }
  if (kind === "heat-pump") {
    return { seer2: 14.3, hspf2: 7.5, text: "Split heat pumps: 14.3 SEER2 and 7.5 HSPF2 nationwide.", source };
  }
  const big = coolingBtuh >= 45_000;
  if (region === "north") return { seer2: 13.4, text: "North region: 13.4 SEER2.", source };
  if (region === "southeast") {
    return { seer2: big ? 13.8 : 14.3, text: big ? "Southeast, 45,000 BTU/h and up: 13.8 SEER2. A unit below it may not be installed in the region, not merely not sold." : "Southeast: 14.3 SEER2. A unit below it may not be installed in the region, not merely not sold.", source };
  }
  // Southwest carries an EER2 floor as well, with a lower one for a unit that
  // is already certified at 15.2 SEER2 or better.
  return {
    seer2: big ? 13.8 : 14.3,
    eer2: big ? 11.2 : 11.7,
    eer2IfHighSeer: 9.8,
    text: big ? "Southwest, 45,000 BTU/h and up: 13.8 SEER2 and 11.2 EER2 (9.8 EER2 if the unit is certified at 15.2 SEER2 or higher)." : "Southwest: 14.3 SEER2 and 11.7 EER2 (9.8 EER2 if the unit is certified at 15.2 SEER2 or higher).",
    source,
  };
}

// ── incentives ──────────────────────────────────────────────────────────────

export interface IncentiveRow {
  program: string;
  scope: "federal" | "state";
  state?: string;
  status: "expired" | "active" | "reserved" | "launching" | "unknown";
  text: string;
  amount?: string;
  condition?: string;
  source: string;
  verifiedOn: string;
}

const HEAR_ACTIVE = new Set(["CA", "MN", "NY", "WI", "MA", "CO"]);
const HEAR_LAUNCHING = new Set(["OH", "PA", "TX", "MI", "WA", "OR", "IL", "NJ"]);

/** What the customer can ask about, as of the verification date. */
export function incentivesFor(state: string): IncentiveRow[] {
  const st = state.toUpperCase();
  const rows: IncentiveRow[] = [
    {
      program: "Federal 25C Energy Efficient Home Improvement Credit",
      scope: "federal",
      status: "expired",
      text: "Ended for property placed in service after 2025-12-31 (Public Law 119-21). A 2026 install earns no federal credit.",
      source: "IRS 25C guidance; P.L. 119-21",
      verifiedOn: RULES_VERIFIED_ON,
    },
  ];
  if (st === "CA") {
    rows.push({
      program: "HEEHRA (California HEAR) single-family retrofit rebate",
      scope: "state",
      state: st,
      status: "reserved",
      amount: "up to $8,000 heat pump",
      condition: "income-qualified household (≤150% AMI); reservations fully subscribed as of 2026-02-24, waitlist only",
      text: "California's single-family HEEHRA funds were fully reserved as of 2026-02-24; new requests go to a waitlist.",
      source: "TECH Clean California / CEC IRA rebate page",
      verifiedOn: RULES_VERIFIED_ON,
    });
  } else if (HEAR_ACTIVE.has(st)) {
    rows.push({
      program: "HEAR (Home Electrification and Appliance Rebates)",
      scope: "state",
      state: st,
      status: "active",
      amount: "up to $8,000 heat pump; up to $14,000 total",
      condition: "income-qualified household (≤80% AMI full, 80–150% AMI half); point of sale through an enrolled contractor",
      text: "State HEAR program open as of mid-2026. Confirm the household's income tier and the contractor's enrollment before quoting it.",
      source: "State energy office HEAR pages; 2026 status trackers",
      verifiedOn: RULES_VERIFIED_ON,
    });
  } else if (HEAR_LAUNCHING.has(st)) {
    rows.push({
      program: "HEAR (Home Electrification and Appliance Rebates)",
      scope: "state",
      state: st,
      status: "launching",
      amount: "up to $8,000 heat pump",
      condition: "income-qualified; program expected to open late 2026",
      text: "This state's HEAR program was announced for late 2026 and was not open on the verification date. Do not quote it.",
      source: "DOE HEAR state status; 2026 status trackers",
      verifiedOn: RULES_VERIFIED_ON,
    });
  } else {
    rows.push({
      program: "HEAR (Home Electrification and Appliance Rebates)",
      scope: "state",
      state: st,
      status: "unknown",
      text: "No confirmed HEAR opening for this state on the verification date. Check the state energy office before quoting a rebate.",
      source: "DOE HEAR state status",
      verifiedOn: RULES_VERIFIED_ON,
    });
  }
  rows.push({
    program: "Utility rebates",
    scope: "state",
    state: st,
    status: "unknown",
    text: "Electric and gas utility rebates vary by utility and change often; add the customer's utility program as a line only once confirmed.",
    source: "",
    verifiedOn: RULES_VERIFIED_ON,
  });
  return rows;
}

// ── state code flags the walk already names ─────────────────────────────────

export interface CodeFlag {
  id: string;
  title: string;
  applies: (job: { state: string; county?: string; touchesRefrigerant: boolean; touchesDucts: boolean; newConstruction: boolean; removesEquipment?: boolean; kind?: string; newFurnace?: boolean; coastal?: boolean }) => boolean;
  status: CheckStatus;
  text: string;
  source: string;
}

export const CODE_FLAGS: CodeFlag[] = [
  // ── California (2025 Energy Code, permits from 2026-01-01; air districts) ──
  {
    id: "ca-uln-furnace",
    title: "Ultra-low NOx gas heat",
    applies: (j) => j.state.toUpperCase() === "CA" && (j.kind === "furnace" || j.kind === "package" || !!j.newFurnace),
    status: "fix",
    text: "In the South Coast, San Joaquin Valley and Bay Area districts a residential gas furnace must be certified at 14 ng/J or less to be sold or installed — order the ultra-low-NOx build (Lennox NV/NE, Carrier 59SU5/59CU5, Goodman -U). Outside those districts, confirm your own air district's limit.",
    source: "South Coast AQMD Rule 1111 Table 1 (amended 2026-01-09); SJVAPCD Rule 4905; BAAQMD Reg 9 Rule 4 (verified 2026-09-17)",
  },
  {
    id: "ca-t24-charge",
    title: "Refrigerant charge and airflow verification",
    applies: (j) => j.state.toUpperCase() === "CA" && j.touchesRefrigerant,
    status: "fix",
    text: "Replacing a refrigerant-containing part (compressor, coil, metering device or line set) makes this an alteration that needs charge and airflow verified by an independent ECC rater, and the system must move at least 300 CFM per ton. A factory-charged package unit is exempt from the charge test.",
    source: "2025 California Energy Code §150.2(b)1F, permits from 2026-01-01 (verified 2026-09-17)",
  },
  {
    id: "ca-t24-duct",
    title: "Duct leakage verification",
    applies: (j) => j.state.toUpperCase() === "CA" && (j.kind !== "water-heater"),
    status: "fix",
    text: "Replacing the furnace, air handler, coil or even just the outdoor unit requires the connected ducts to be sealed and verified by a certified ECC rater. Ducts already verified under RA3.1, systems under 40 linear feet and asbestos ducts are exempt.",
    source: "2025 California Energy Code §150.2(b)1E, permits from 2026-01-01 (verified 2026-09-17)",
  },
  {
    id: "ca-no-electric-primary",
    title: "Electric resistance as primary heat",
    applies: (j) => j.state.toUpperCase() === "CA" && j.kind !== "water-heater",
    status: "verify",
    text: "On a single-family alteration electric resistance may not be the primary heat source — a heat pump with strip backup is fine, and so is any non-resistance primary source. The exceptions are narrow: a non-ducted swap where the existing heat is already resistance, and a few ducted cases.",
    source: "2025 California Energy Code §150.2(b)1G, permits from 2026-01-01 (verified 2026-09-17)",
  },
  {
    id: "ca-carb-gwp",
    title: "California refrigerant cap",
    applies: (j) => j.state.toUpperCase() === "CA" && j.touchesRefrigerant,
    status: "verify",
    text: "California bars refrigerants at 750 GWP or above in new air-conditioning and heat-pump equipment made after 2025-01-01, and counts a single-condenser system that gets a new outdoor unit as new equipment — so an R-410A condenser swap is out and the job goes to R-454B or R-32.",
    source: "17 CCR §95374(c) Table 3 and §95375(c)1 (verified 2026-09-17)",
  },
  {
    id: "ca-cf-forms",
    title: "CF1R, CF2R and CF3R",
    applies: (j) => j.state.toUpperCase() === "CA",
    status: "fix",
    text: "The building department cannot issue the permit without the CF1R, and cannot pass the final without the installer-signed CF2R plus a CF3R from the ECC rater for every measure that needs verifying. Price the rater's visit into the job.",
    source: "Title 24 Part 1 §10-103; the 2025 code renamed HERS to the Energy Code Compliance (ECC) program (verified 2026-09-17)",
  },
  // ── Washington (2021 WSEC-R, in force to 2027-05-03) ──────────────────────
  {
    id: "wa-manual-s",
    title: "Manual J load and Manual S selection",
    applies: (j) => j.state.toUpperCase() === "WA" && j.kind !== "water-heater",
    status: "fix",
    text: "Washington's energy code requires the equipment to be selected by Manual S against a Manual J load, at the smallest available size that exceeds it — a like-for-like swap on the old unit's tonnage is not compliant without the calculation.",
    source: "2021 WSEC-R R403.7 (WAC 51-11R-40360), statewide from 2024-03-15 (verified 2026-09-17)",
  },
  {
    id: "wa-hp-lockout",
    title: "Supplementary heat lockout",
    applies: (j) => j.state.toUpperCase() === "WA" && j.kind === "heat-pump",
    status: "fix",
    text: "The heat pump must run compression heat as the first stage, lock out supplementary electric heat above the balance point, and show the homeowner when the backup is running. Pick a thermostat and control package that can do both.",
    source: "2021 WSEC-R R403.1.2, statewide from 2024-03-15 (verified 2026-09-17)",
  },
  {
    id: "wa-no-standing-pilot",
    title: "No standing pilot",
    applies: (j) => j.state.toUpperCase() === "WA" && j.kind === "furnace",
    status: "pass",
    text: "A continuously burning pilot is prohibited on a gas furnace in Washington; every current furnace uses hot-surface or intermittent ignition, so this is a check on what comes out, not what goes in.",
    source: "2021 WSEC-R R403.1.3 (WAC 51-11R-40310) (verified 2026-09-17)",
  },
  {
    id: "wa-estar-tstat",
    title: "ENERGY STAR thermostat",
    applies: (j) => j.state.toUpperCase() === "WA" && (j.kind === "furnace" || !!j.newFurnace),
    status: "fix",
    text: "Where the primary heat is a forced-air furnace, at least one thermostat must be ENERGY STAR certified with a 5-2 schedule and two setback periods a day — price that stat, not the builder-grade one.",
    source: "2021 WSEC-R R403.1.1 (verified 2026-09-17)",
  },
  {
    id: "wa-hfc-750",
    title: "Washington refrigerant cap",
    applies: (j) => j.state.toUpperCase() === "WA" && j.touchesRefrigerant,
    status: "verify",
    text: "Since 2026-01-01 Washington bars refrigerants above 750 GWP in new residential AC and heat-pump equipment, and Ecology counts replacing both the outdoor unit and the indoor coil as new equipment — so a whole-system R-410A replacement is out.",
    source: "WAC 173-443-040 Table 3, enforced by WAC 173-443-075(1) (verified 2026-09-17)",
  },
  // ── Oregon ────────────────────────────────────────────────────────────────
  {
    id: "or-minor-label",
    title: "Minor label does not cover this",
    applies: (j) => j.state.toUpperCase() === "OR" && (j.kind === "furnace" || j.kind === "package" || !!j.newFurnace),
    status: "verify",
    text: "Oregon's minor mechanical label cannot be used when fuel-burning equipment is replaced and the venting changes with it — an 80% to condensing conversion needs a full mechanical permit and inspection.",
    source: "Oregon BCD minor label program; Portland PP&D program guide §B.2.d (verified 2026-09-17)",
  },
  {
    id: "or-duct-r8",
    title: "New duct insulation",
    applies: (j) => j.state.toUpperCase() === "OR" && j.touchesDucts,
    status: "fix",
    text: "New or replaced duct outside the conditioned envelope must be insulated to R-8 in Oregon; price the wrap or the insulated flex, not bare pipe.",
    source: "2023 Oregon Residential Specialty Code, effective 2023-10-01 (verified 2026-09-17)",
  },
  // ── Florida ───────────────────────────────────────────────────────────────
  {
    id: "fl-seer2-install",
    title: "Southeast minimum is an install rule",
    applies: (j) => ["FL", "GA", "AL", "MS", "LA", "SC", "NC", "TN", "AR", "OK", "TX", "VA", "KY", "DE", "MD", "DC", "HI"].includes(j.state.toUpperCase()) && (j.kind === "air-conditioner" || j.kind === "package"),
    status: "fix",
    text: "In the Southeast region the SEER2 minimum binds the installer, not just the seller: it is illegal to install a split air conditioner below it, even one bought before the rule. Check the AHRI rating of the exact matched system, not the outdoor unit alone.",
    source: "DOE regional standards enforcement, effective 2023-01-01 (verified 2026-09-17)",
  },
  {
    id: "fl-wind-tiedown",
    title: "Wind tie-down and product approval",
    applies: (j) => j.state.toUpperCase() === "FL" && j.kind !== "water-heater",
    status: "fix",
    text: "The outdoor unit or rooftop package needs a Florida Product Approval or Miami-Dade NOA and a hurricane tie-down to the slab or curb, sized for the site's wind zone. Price the anchors and the stand.",
    source: "Florida Building Code, Mechanical and Building, wind-borne debris provisions (verified 2026-09-17)",
  },
  {
    id: "fl-float-switch",
    title: "Condensate float switch",
    applies: (j) => j.state.toUpperCase() === "FL" && j.kind !== "water-heater",
    status: "fix",
    text: "Florida requires a condensate overflow shutoff on the air handler — the secondary pan switch or an in-line float — on a change-out, not just on new work.",
    source: "Florida Building Code, Mechanical (verified 2026-09-17)",
  },
  {
    id: "fl-coastal",
    title: "Salt air",
    applies: (j) => !!j.coastal && j.kind !== "water-heater",
    status: "verify",
    text: "Within about a mile of salt water, order the coastal build or the maker's sea-coast kit — Carrier's C-suffix coastal SKUs, Trane's Sea Coast kit. Trane voids the warranty on a standard unit installed inside a mile of salt water, inland waterways included.",
    source: "Carrier coastal product pages; Trane BAYSEAC001 Sea Coast Kit (verified 2026-09-17)",
  },
  // ── Texas ─────────────────────────────────────────────────────────────────
  {
    id: "tx-tdlr",
    title: "TDLR licence and permit",
    applies: (j) => j.state.toUpperCase() === "TX",
    status: "verify",
    text: "Texas requires a TDLR air conditioning and refrigeration contractor licence for the work, and most jurisdictions want a mechanical permit with a Manual J sizing form attached — Houston's form cites IRC M1401.3 and M1601.1.",
    source: "Texas Department of Licensing and Regulation, ACR programme; City of Houston mechanical permit form (verified 2026-09-17)",
  },
  // ── New York ──────────────────────────────────────────────────────────────
  {
    id: "ny-manual-js",
    title: "Sizing on the permit",
    applies: (j) => j.state.toUpperCase() === "NY" && j.kind !== "water-heater",
    status: "fix",
    text: "New York's energy code requires the replacement to be sized by Manual J and selected by Manual S, with the calculation on the permit application.",
    source: "NYS Energy Conservation Construction Code, 2025 edition (verified 2026-09-17)",
  },
  {
    id: "wa-or-duct-test",
    title: "Washington / Oregon duct testing",
    applies: (j) => ["WA", "OR"].includes(j.state.toUpperCase()) && j.touchesDucts,
    status: "verify",
    text: "Duct leakage testing is required when ducts are replaced or added; new construction also needs whole-house ventilation.",
    source: "WSEC / ORSC (verify the current edition)",
  },
  {
    id: "federal-floor",
    title: "Federal efficiency floor",
    applies: (j) => ["air-conditioner", "heat-pump", "ductless", "package"].includes(j.kind ?? ""),
    status: "pass",
    text: "New equipment must meet the DOE regional SEER2 / EER2 / HSPF2 minimum; the selection rule reads the floor from the table.",
    source: "DOE standards effective 2023-01-01",
  },
  {
    id: "furnace-floor",
    title: "Furnace efficiency floor",
    applies: (j) => j.kind === "furnace",
    status: "pass",
    text: "Gas furnaces: 80% AFUE today; non-weatherized gas furnaces made from 2028-12-18 must reach 95% AFUE (condensing), so an 80% unit installed later will be a repair-only class.",
    source: "DOE 10 CFR 430.32(e), final rule 2023-12",
  },
  {
    id: "epa-608",
    title: "EPA 608 recovery",
    applies: (j) => j.touchesRefrigerant && !j.newConstruction && j.removesEquipment !== false,
    status: "pass",
    text: "Refrigerant must be recovered by a certified technician before the old equipment is removed; the recovery is its own line.",
    source: "40 CFR Part 82 Subpart F",
  },
];
