// PROOF CARD — fixtures (route: /dashboard/manual-proof).
//
// The data layer is out of scope until the layout is signed off: no Prisma, no
// server action, no network call, nothing imported from src/actions or from the
// live builder's Zustand store. Everything below is a plain constant.
//
// EVERY ID CARRIES THE `mc_` PREFIX so it can never be mistaken for a real
// record — including ids minted at runtime (see `newId` in the math module).
//
// THE SEED IS DELIBERATELY PART-FILLED, because a design whose whole argument
// is "every card states its consequence" proves nothing on an empty page. On
// first load:
//   01 BASICS    — filled, but one client on file has NO contact details, so
//                  the thin-record empty state is one pick away
//   02 LINES     — four priced lines + ONE UNNAMED, UNPRICED ROW, so the
//                  incomplete-row state is visible without hunting
//   03 ESTIMATE  — materials 18% / labor 12% (the product defaults), overhead
//                  and profit at 0.0%, so a $0 ledger row has to look
//                  intentional rather than broken
//   04 TAX       — 8.25%, estimated from the client's Texas address and NOT yet
//                  overridden, so the provenance chip has something to say
//   05 PAYMENT   — the 30/30/40 schedule, reconciling exactly
//   06 SCOPE     — written
//   07 OPTIONS   — labor-only OFF (one line WOULD be suppressed by it — the
//                  dumpster — so the toggle has a visible money consequence)
//   08 TERMS     — EMPTY, so "Insert starter template" has work to do and the
//                  card's coverage footer reads as a genuine gap
//   09 FILES     — two attachments, 3.1 MB
//
// Texture is a Texas roof replacement rather than the house Seattle fixture:
// the brief asks for a Texas address specifically, so the address→tax estimate
// reads a real non-zero rate on load.

import type {
  ClientRecord,
  Installment,
  LineItem,
  ProjectRecord,
  ProofDraft,
  StagedFile,
} from "./manual-proof-types";

/** Shown as the sender on the client's copy. Stands in for the org record. */
export const ORG_NAME = "Northgate Roofing & Exteriors";
export const ORG_LINE = "TX RCAT #17-4482 · Round Rock, TX";

/** The drawing-annotation header. Fixed strings rather than `new Date()`: this
 *  tree is server-rendered before it hydrates, and a clock read during render
 *  is a guaranteed hydration mismatch. */
export const PROPOSAL_NO = "PC-2047";
export const PROPOSAL_DATE = "2026-08-07";
export const VALID_DAYS = 30;

/**
 * Base state sales-tax rates, fixture-local on purpose: the real estimate comes
 * from a service this design route is not allowed to call. Used by the
 * address→tax link in card 01 and by "re-estimate from the address" in card 04.
 */
export const STATE_TAX: Record<string, number> = {
  TX: 8.25,
  CA: 7.25,
  FL: 6.0,
  NY: 4.0,
  WA: 10.35,
  AZ: 8.6,
};

/** Full names for the provenance chip — "Estimated from Texas ·". */
export const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  CA: "California",
  FL: "Florida",
  NY: "New York",
  WA: "Washington",
  AZ: "Arizona",
};

/** Offered by the Terms field while it is empty. The same three clauses the
 *  live builder's starter template carries. */
export const TERMS_TEMPLATE = `1. Payment is due as scheduled below. The balance is due on completion.
2. Any change to the scope is handled by a written change order, priced and signed before that work starts.
3. Workmanship is warranted for 24 months from completion. The manufacturer's material warranty passes to the owner at final payment.
4. This proposal is valid for ${VALID_DAYS} days from the date above.`;

/** Clients on file for the picker. */
export const SEED_CLIENTS: ClientRecord[] = [
  {
    id: "mc_cl_patel",
    name: "Devan & Nisha Patel",
    email: "nisha.patel@example.com",
    phone: "(512) 555-0148",
    address: "4118 Cedar Bluff Ln",
    city: "Round Rock",
    state: "TX",
    zip: "78681",
    tags: ["Repeat"],
  },
  {
    id: "mc_cl_okonkwo",
    name: "Amara Okonkwo",
    email: "amara@okonkwoholdings.example",
    phone: "(512) 555-0192",
    address: "7309 Manchaca Rd",
    city: "Austin",
    state: "TX",
    zip: "78745",
    tags: ["VIP"],
  },
  {
    id: "mc_cl_reyes",
    name: "Reyes Property Group",
    email: "work.orders@reyespg.example",
    phone: "(737) 555-0106",
    address: "2200 Cypress Creek Rd",
    city: "Cedar Park",
    state: "TX",
    zip: "78613",
    tags: [],
  },
  {
    // A thin record on purpose: picking this client shows the
    // "No contact details on file." empty state and drops the tax provenance,
    // because there is no address to estimate a rate from.
    id: "mc_cl_hollins",
    name: "Travis Hollins",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    tags: [],
  },
];

/** Projects on file for the picker. */
export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: "mc_pj_cedarbluff",
    name: "Patel — Cedar Bluff re-roof",
    description: "Full tear-off and re-roof, 28.5 squares, one existing layer.",
  },
  {
    id: "mc_pj_okonkwo",
    name: "Okonkwo — Manchaca flat roof",
    description: "TPO recover over the rear addition, 6 squares.",
  },
  {
    id: "mc_pj_reyes",
    name: "Reyes PG — 2026 turn work",
    description: "Rolling repair and turn work across nine managed buildings.",
  },
];

/**
 * Addresses the `Find` affordance offers. A fixture list, not a Places call —
 * this route may not touch the network, and the point of the control is the
 * INTERACTION (pick one, watch the tax estimate follow), not the data source.
 */
export const SEED_ADDRESSES: string[] = [
  "4118 Cedar Bluff Ln, Round Rock, TX 78681",
  "7309 Manchaca Rd, Austin, TX 78745",
  "2200 Cypress Creek Rd, Cedar Park, TX 78613",
  "915 W Whitestone Blvd, Cedar Park, TX 78613",
  "1604 Sam Bass Rd, Round Rock, TX 78681",
];

/** The seeded work: a believable 28.5-square Round Rock tear-off. */
const SEED_LINES: LineItem[] = [
  {
    id: "mc_ln_teardown",
    name: "Tear off existing 3-tab, one layer",
    description: "Includes a magnet sweep of the drive and the beds at the end of each day.",
    unit: "SQFT",
    quantity: 2850,
    unitPrice: 0.62,
    materialCost: 0,
    laborCost: 0.62,
  },
  {
    id: "mc_ln_decking",
    name: "Deck repair allowance · 7/16in OSB",
    description: "An allowance. Unused sheets are credited back on the final invoice.",
    unit: "UNIT",
    quantity: 14,
    unitPrice: 55.8,
    materialCost: 24.8,
    laborCost: 31,
  },
  {
    id: "mc_ln_shingle",
    name: "Architectural shingle · 30 yr, Weathered Wood",
    description: "Colour confirmed against the sample board on 07-29. Includes starter, hip and ridge.",
    unit: "SQFT",
    quantity: 2850,
    unitPrice: 3.12,
    materialCost: 1.38,
    laborCost: 1.74,
  },
  {
    // PURE MATERIAL — no labor. This is the row a labor-only quote drops, which
    // is what gives option 07 a real, visible money consequence.
    id: "mc_ln_dumpster",
    name: "Dumpster · 30 yd roll-off, permitted haul-off",
    description: "",
    unit: "UNIT",
    quantity: 2,
    unitPrice: 480,
    materialCost: 480,
    laborCost: 0,
  },
  {
    // Deliberately incomplete: a row the contractor opened and walked away
    // from. It contributes $0, it never prints, and card 02's footer says so
    // out loud rather than letting it hide in the middle of the table.
    id: "mc_ln_blank",
    name: "",
    description: "",
    unit: "UNIT",
    quantity: 1,
    unitPrice: 0,
    materialCost: 0,
    laborCost: 0,
  },
];

/** The 30 / 30 / 40 schedule the brief seeds. It reconciles exactly, so the
 *  reconciliation readout opens in its settled state and the BROKEN state has
 *  to be reached by editing — which is the right way round for a demo. */
const SEED_INSTALLMENTS: Installment[] = [
  { id: "mc_in_deposit", label: "Deposit — due at signing", amount: 30, isPercent: true },
  { id: "mc_in_start", label: "Start of work — materials on site", amount: 30, isPercent: true },
  { id: "mc_in_final", label: "Completion — final walkthrough", amount: 40, isPercent: true },
];

/** Two attachments, 3.1 MB between them. */
const SEED_FILES: StagedFile[] = [
  { id: "mc_fl_elevations", name: "patel-elevations.pdf", size: 2_148_352 },
  { id: "mc_fl_sample", name: "weathered-wood-sample.jpg", size: 1_104_896 },
];

export const SEED_SCOPE = `Remove the existing 3-tab layer down to the deck and haul it off. Replace damaged decking up to the allowance below. Install synthetic underlayment across the field, ice and water membrane in both valleys and at every penetration, and a 30-year architectural shingle in Weathered Wood. Reflash the two plumbing stacks and the chimney cricket. Install a continuous baffled ridge vent. Clean the site daily and magnet-sweep the drive, walks and beds before leaving.`;

export const SEED_NOTES = `Gutters and downspouts stay as they are. The satellite dish comes down and goes back on the same mount. Access from the alley side; the homeowner keeps the driveway clear on the tear-off day.`;

export const SEED_DESCRIPTION = `A complete tear-off and replacement of the roof at 4118 Cedar Bluff Ln, using a 30-year architectural shingle system with new underlayment, valley protection and continuous ridge ventilation.`;

/**
 * A fresh copy of the seed.
 *
 * Returned by a function rather than exported as a constant because "Reset"
 * hands this straight back into state: a shared constant would let one
 * session's edits leak into the next reset through the nested arrays.
 */
export function makeSeedDraft(): ProofDraft {
  return {
    title: "Patel Residence — Roof Replacement",
    description: SEED_DESCRIPTION,
    projectId: "mc_pj_cedarbluff",
    client: { mode: "record", id: "mc_cl_patel" },
    address: "4118 Cedar Bluff Ln, Round Rock, TX 78681",
    lines: SEED_LINES.map((l) => ({ ...l })),
    taxPct: STATE_TAX.TX,
    taxAuto: true,
    taxState: "TX",
    markups: {
      // The product's own defaults, verbatim. Overhead and profit sit at zero
      // so the ledger opens with two $0.00 rows that have to look deliberate.
      materialMarkupPct: 18,
      laborMarkupPct: 12,
      overheadPct: 0,
      profitPct: 0,
    },
    installments: SEED_INSTALLMENTS.map((i) => ({ ...i })),
    options: {
      hideBreakdown: false,
      laborOnly: false,
      showSignature: true,
      showScope: true,
    },
    scopeOfWork: SEED_SCOPE,
    notes: SEED_NOTES,
    // Empty on purpose — card 08's coverage footer has to report a real gap,
    // and "Insert starter template" needs somewhere to land.
    terms: "",
    files: SEED_FILES.map((f) => ({ ...f })),
  };
}
