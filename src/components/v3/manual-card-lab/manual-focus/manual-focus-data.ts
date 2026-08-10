// FOCUS CARD — fixtures and the address/tax lookup.
//
// Route: /dashboard/manual-focus.
//
// FIXTURE-ONLY, DELIBERATELY. No Prisma, no server action, no `@/actions/*`, no
// network call, no shared Zustand store. Everything below is a plain constant
// and every id carries an `mc_` prefix so a row from this page can never be
// mistaken for a real record in a screenshot, a console log or a bug report.
//
// THE SEED IS PART-FILLED ON PURPOSE. This variant's bet is that nine
// stood-down cards can be READ without opening them, and a summary face proves
// nothing against an empty draft: "Client — none", "Lines — none", "$0" would
// all look identical no matter how the summaries were designed. So the sheet
// opens mid-job, with three things still visibly unfinished:
//   03 LINE ITEMS  — one row has no name, so it is not counted and not printed
//                    (the row says so, in amber, rather than quietly adding $0)
//   07 TERMS       — empty, so the starter-template action has a real job
//   09 FILES       — one staged file, so both the list and its remove are live
// and one client on file (Ruiz & Sons) has NO contact details at all, so the
// picker's "No contact details on file." state is one selection away rather
// than something a reviewer has to construct.
//
// Texture is an Austin, Texas re-roof: Texas so the address-driven tax estimate
// resolves to a real, non-zero 8.25% on load, which is what makes card 02's
// "changing the address moves the tax rate in card 03" behaviour visible
// without typing anything.

import type {
  ClientRecord,
  Draft,
  Installment,
  Line,
  ProjectRecord,
  StagedFile,
} from "./manual-focus-types";

/* ============================================================
   THE ORG — stands in for the organisation record
   ============================================================ */

/** Printed as the sender on the client's copy. */
export const ORG_NAME = "Northgate Roofing & Exteriors";
export const ORG_LINE = "TX RCAT #24118 · Austin, TX · (512) 555-0148";

/** Drawing-annotation header on the masthead and on the client's copy. Fixed
 *  strings rather than `new Date()`: this tree is server-rendered before it
 *  hydrates, and a clock read during render is a guaranteed mismatch. */
export const PROPOSAL_NO = "MC-2041";
export const PROPOSAL_DATE = "2026-08-07";
export const VALID_DAYS = 30;

/** The org's saved markup defaults, shown by "Save these as company defaults"
 *  and used by Reset. These are the four defaults the spec names. */
export const DEFAULT_MARKUPS = {
  materialMarkupPct: 18,
  laborMarkupPct: 12,
  overheadPct: 0,
  profitPct: 0,
};

/** Offered by the Terms field, which the seed leaves empty on purpose. */
export const TERMS_TEMPLATE = `1. Payment is due as scheduled below. The balance is due on completion.
2. Any change to the scope is handled by a written change order, agreed before that work starts.
3. Workmanship is warranted for 24 months from completion. The manufacturer's material warranty passes to the owner at final payment.
4. This proposal is valid for ${VALID_DAYS} days from the date above.`;

/* ============================================================
   THE TAX LOOKUP
   ============================================================ */

/**
 * Average combined state + local sales-tax rates, as percentages. A short table
 * on purpose: it exists to make the address -> tax behaviour real and testable,
 * not to be a tax engine. An unknown state simply produces no estimate, which
 * is the honest answer and leaves whatever rate is already typed alone.
 */
const STATE_TAX: Record<string, { name: string; pct: number }> = {
  TX: { name: "Texas", pct: 8.25 },
  WA: { name: "Washington", pct: 10.35 },
  CA: { name: "California", pct: 8.85 },
  AZ: { name: "Arizona", pct: 8.4 },
  CO: { name: "Colorado", pct: 7.78 },
  FL: { name: "Florida", pct: 7.0 },
  GA: { name: "Georgia", pct: 7.35 },
  IL: { name: "Illinois", pct: 8.85 },
  NC: { name: "North Carolina", pct: 6.99 },
  NY: { name: "New York", pct: 8.52 },
  OH: { name: "Ohio", pct: 7.24 },
  OK: { name: "Oklahoma", pct: 8.99 },
  TN: { name: "Tennessee", pct: 9.55 },
};

/** Human name for a two-letter code, for the "Estimated from Texas" note. */
export function stateDisplayName(code: string): string {
  return STATE_TAX[code.toUpperCase()]?.name ?? code.toUpperCase();
}

/**
 * Pull a state out of a free-typed one-line address.
 *
 * Matches a standalone two-letter token that is a state we know — "3411 Wild
 * Cherry Dr, Austin, TX 78704" -> TX. Deliberately conservative: it will not
 * guess from a city name and it will not fire on "TX" inside a word, because a
 * wrong estimate that silently rewrites a tax rate is worse than no estimate.
 */
export function estimateFromAddress(address: string): { code: string; pct: number } | null {
  const tokens = address.toUpperCase().match(/\b[A-Z]{2}\b/g);
  if (!tokens) return null;
  // Last match wins: US addresses put the state after the city, and a street
  // name can easily open with a two-letter word ("NE 62nd St").
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const hit = STATE_TAX[tokens[i]];
    if (hit) return { code: tokens[i], pct: hit.pct };
  }
  return null;
}

/* ============================================================
   RECORDS ON FILE
   ============================================================ */

export const SEED_CLIENTS: ClientRecord[] = [
  {
    id: "mc_cl_patel",
    name: "Anjali Patel",
    email: "anjali.patel@example.com",
    phone: "(512) 555-0173",
    address: "3411 Wild Cherry Dr",
    city: "Austin",
    state: "TX",
    zip: "78704",
    tags: ["Repeat"],
  },
  {
    id: "mc_cl_okonkwo",
    name: "Dele & Ify Okonkwo",
    email: "dokonkwo@example.com",
    phone: "(512) 555-0119",
    address: "1208 Rutland Dr",
    city: "Austin",
    state: "TX",
    zip: "78758",
    tags: ["VIP"],
  },
  {
    id: "mc_cl_brightwater",
    name: "Brightwater Property Group",
    email: "maintenance@brightwaterpg.example",
    phone: "(737) 555-0104",
    address: "900 Congress Ave, Suite 210",
    city: "Austin",
    state: "TX",
    zip: "78701",
    tags: ["Commercial", "Net 30"],
  },
  {
    // Deliberately thin — this is the "No contact details on file." state, one
    // selection away rather than something a reviewer has to construct.
    id: "mc_cl_ruiz",
    name: "Ruiz & Sons",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    tags: [],
  },
  {
    id: "mc_cl_haverford",
    name: "Marguerite Haverford",
    email: "m.haverford@example.com",
    phone: "(830) 555-0166",
    address: "77 Sabinal Rd",
    city: "Boerne",
    state: "TX",
    zip: "78006",
    tags: [],
  },
];

export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: "mc_pj_patel",
    name: "Patel Residence — 2026 re-roof",
    description: "Full tear-off and re-roof, 24 squares, one existing layer.",
  },
  {
    id: "mc_pj_okonkwo",
    name: "Okonkwo — Rutland Dr repairs",
    description: "Hail claim: ridge, two valleys and a chimney flashing.",
  },
  {
    id: "mc_pj_brightwater",
    name: "Brightwater PG — 2026 maintenance",
    description: "Rolling repair work across nine managed buildings.",
  },
];

/* ============================================================
   THE SEEDED DRAFT
   ============================================================ */

/** Four real lines with mixed units and a genuine material/labor split, plus
 *  one deliberately unnamed row — see the file header. */
const SEED_LINES: Line[] = [
  {
    id: "mc_ln_tearoff",
    name: "Tear off existing 3-tab, one layer",
    description: "Includes a magnet sweep of the drive and beds at the end of each day.",
    unit: "SQFT",
    quantity: 2400,
    materialCost: 0,
    laborCost: 0.62,
  },
  {
    id: "mc_ln_shingle",
    name: "Architectural shingle · 30 yr, Weathered Slate",
    description: "Colour confirmed against the sample board on 07-29.",
    unit: "SQFT",
    quantity: 2400,
    materialCost: 1.38,
    laborCost: 1.74,
  },
  {
    id: "mc_ln_ridge",
    name: "Ridge vent · continuous, baffled",
    description: "",
    unit: "LINEAR_FT",
    quantity: 64,
    materialCost: 7.2,
    laborCost: 4.1,
  },
  {
    id: "mc_ln_haul",
    name: "Dumpster · 20 yd, permitted haul-off",
    description: "",
    unit: "UNIT",
    quantity: 1,
    materialCost: 540,
    laborCost: 45,
  },
  {
    // The empty state, on the page from the first paint. It has a price and no
    // name, so it is NOT counted and NOT printed — and says so, in amber.
    id: "mc_ln_blank",
    name: "",
    description: "",
    unit: "UNIT",
    quantity: 1,
    materialCost: 0,
    laborCost: 0,
  },
];

/** 30 / 30 / 40 — the spec's seed, and exactly 100% of the total, so the
 *  reconciliation meter opens BALANCED and the user can see it break. */
const SEED_INSTALLMENTS: Installment[] = [
  { id: "mc_in_deposit", label: "Deposit — on signing", amount: 30, isPercent: true },
  { id: "mc_in_start", label: "Start of work", amount: 30, isPercent: true },
  { id: "mc_in_completion", label: "Completion", amount: 40, isPercent: true },
];

const SEED_FILES: StagedFile[] = [
  {
    id: "mc_fl_elevations",
    name: "patel-elevations-rev-c.pdf",
    size: 486_912,
    kind: "application/pdf",
  },
];

/**
 * A fresh copy of the seed.
 *
 * A function rather than an exported constant because "Reset" hands this
 * straight back into state: a shared constant would let one session's edits
 * leak into the next reset through the nested arrays.
 */
export function makeSeedDraft(): Draft {
  return {
    title: "Patel Residence — Roof Replacement",
    description:
      "Full tear-off of the existing shingle roof and installation of a new 30-year architectural system, including synthetic underlayment, ice-and-water protection in the valleys, and continuous baffled ridge ventilation.",
    projectId: "mc_pj_patel",
    client: { mode: "record", id: "mc_cl_patel" },

    address: "3411 Wild Cherry Dr, Austin, TX 78704",
    addressAuto: true,

    lines: SEED_LINES.map((l) => ({ ...l })),

    taxPct: 8.25,
    taxAuto: true,
    taxState: "TX",

    ...DEFAULT_MARKUPS,
    // NOT part of DEFAULT_MARKUPS: a discount is a decision about ONE job, not
    // an org default. "Save these as company defaults" must never carry it, or
    // every future proposal quietly opens pre-discounted.
    discountPct: 0,

    scopeOfWork:
      "Remove existing shingles and underlayment down to the deck. Replace any decking found to be soft or delaminated, billed at the allowance rate. Install synthetic underlayment across the field and ice-and-water membrane in both valleys and at every penetration. Install starter, field shingle, hip and ridge cap per manufacturer specification. Replace all pipe boots and step flashing. Haul off all debris and magnet-sweep the property daily.",
    notes:
      "Gutters stay as they are. The satellite dish comes down and goes back on the same mount. Access from the alley; the driveway stays clear for the homeowner throughout.",
    // Empty on purpose — the starter-template action needs a real job to do.
    terms: "",

    options: {
      hideBreakdown: false,
      laborOnly: false,
      showSignature: true,
      showScope: true,
    },
    installments: SEED_INSTALLMENTS.map((i) => ({ ...i })),
    files: SEED_FILES.map((f) => ({ ...f })),
  };
}
