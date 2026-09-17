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
}

/** Minimum a NEW unit may carry in this state, by equipment class. */
export function efficiencyFloor(state: string, kind: "air-conditioner" | "heat-pump", coolingBtuh: number): EfficiencyFloor {
  const region = doeRegion(state);
  const source = "DOE residential central AC and heat pump standards, effective 2023-01-01 (verified 2026-09-15)";
  if (kind === "heat-pump") {
    return { seer2: 14.3, hspf2: 7.5, text: "Heat pumps: 14.3 SEER2 and 7.5 HSPF2 nationwide.", source };
  }
  const big = coolingBtuh >= 45_000;
  if (region === "north") return { seer2: 13.4, text: "North region: 13.4 SEER2.", source };
  if (region === "southeast") {
    return { seer2: big ? 13.8 : 14.3, text: big ? "Southeast, 45,000 BTU/h and up: 13.8 SEER2." : "Southeast: 14.3 SEER2.", source };
  }
  return {
    seer2: big ? 13.8 : 14.3,
    eer2: big ? 11.7 : 12.2,
    text: big ? "Southwest, 45,000 BTU/h and up: 13.8 SEER2 and 11.7 EER2." : "Southwest: 14.3 SEER2 and 12.2 EER2.",
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
  applies: (job: { state: string; touchesRefrigerant: boolean; touchesDucts: boolean; newConstruction: boolean; removesEquipment?: boolean; kind?: string }) => boolean;
  status: CheckStatus;
  text: string;
  source: string;
}

export const CODE_FLAGS: CodeFlag[] = [
  {
    id: "ca-hers",
    title: "California HERS verification",
    applies: (j) => j.state.toUpperCase() === "CA" && (j.touchesRefrigerant || j.touchesDucts),
    status: "verify",
    text: "Title 24 Part 6 requires HERS-verified duct leakage, airflow, fan watt draw and refrigerant charge on an altered system; price the HERS rater's visit.",
    source: "2022 Title 24 Part 6 §150.2(b) (verify current cycle)",
  },
  {
    id: "ca-manual-j",
    title: "California permit load calculation",
    applies: (j) => j.state.toUpperCase() === "CA",
    status: "verify",
    text: "A California mechanical permit normally wants an ACCA-approved Manual J / S / D set; attach the approved report before submitting.",
    source: "CBC / Title 24 permit practice",
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
    id: "fl-wind",
    title: "Florida outdoor-unit wind rating",
    applies: (j) => j.state.toUpperCase() === "FL",
    status: "verify",
    text: "Outdoor units need a hurricane-rated pad or stand and tie-downs, and the product approval must match the wind zone.",
    source: "Florida Building Code, Mechanical (verify wind zone)",
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
