// PRICE FIRST — fixtures. (route: /dashboard/manual-margin)
//
// The data layer is out of scope until the layout is signed off: no Prisma, no
// server action, no network call, nothing imported from src/actions, and
// nothing from the live builder's shared draft store. Everything below is a
// plain constant, and every id carries the `mc_` prefix so a value from here
// can never be mistaken for a real record.
//
// THE SEED IS DELIBERATELY PART-FILLED, because this page argues that money
// comes first and a money-first page with no money proves nothing. On load:
//
//   · a real Texas client and address    → the tax estimate reads 8.25%,
//                                          provenance chip says "Estimated
//                                          from Texas ·"
//   · four priced lines, mixed units     → the price card has something to
//                                          reconcile
//   · ONE UNNAMED LINE                   → the row empty state is visible
//                                          without hunting for it
//   · a client on file with NO contact   → "No contact details on file."
//     details (Trinity Vale)                is reachable in one click
//   · overhead 0.0% and profit 0.0%      → two $0 ledger rows, on purpose:
//                                          a $0 must look intentional
//   · a TARGET of $19,500 already set    → the reconciliation line, the gap
//                                          and the profit solve are all alive
//                                          on first paint
//   · terms EMPTY                        → the starter-template action has a
//                                          job to do
//
// At those numbers the sheet opens short of its target by ~$2,600 with a 12.7%
// margin — a thin, believable, slightly uncomfortable quote, which is exactly
// the state a contractor is in when they reach for a page like this.
//
// Texture is North Texas roofing work, per the brief's Texas requirement and
// the house convention that fake data is specific and plausible.

import type {
  ClientRecord,
  Installment,
  Line,
  MarginDraft,
  ProjectRecord,
  StagedFile,
} from "./manual-margin-types";

/** Shown as the sender on the client's copy. Stands in for the org record. */
export const ORG_NAME = "Northgate Roofing & Exteriors";

/** Drawing-annotation header on the masthead and on the client's copy. Fixed
 *  strings rather than `new Date()`: this tree is server-rendered before it
 *  hydrates, and a clock read during render is a guaranteed mismatch. */
export const PROPOSAL_NO = "MC-2041";
export const PROPOSAL_DATE = "2026-08-07";
export const VALID_DAYS = 30;

/** The org's saved markup defaults — what "Save these as company defaults"
 *  would write, and what the live builder starts a fresh proposal with. */
export const DEFAULT_MARKUPS = {
  materialMarkupPct: 18,
  laborMarkupPct: 12,
  overheadPct: 0,
  profitPct: 0,
};

/**
 * Combined state + average local sales-tax rates, rounded to the hundredth.
 * The estimate this drives is exactly that — an ESTIMATE — which is why the
 * field says so and stays editable forever after.
 */
export const STATE_TAX: Record<string, number> = {
  TX: 8.25,
  WA: 10.35,
  CA: 8.85,
  FL: 7.0,
  NY: 8.52,
  AZ: 8.4,
  CO: 7.8,
  GA: 7.35,
  NC: 7.0,
  OK: 8.99,
};

/** Spelled out for the provenance chip: "Estimated from Texas ·". */
export const STATE_NAMES: Record<string, string> = {
  TX: "Texas",
  WA: "Washington",
  CA: "California",
  FL: "Florida",
  NY: "New York",
  AZ: "Arizona",
  CO: "Colorado",
  GA: "Georgia",
  NC: "North Carolina",
  OK: "Oklahoma",
};

/** Offered by the Terms field while it is empty. The live builder's three
 *  starter clauses, verbatim in substance. */
export const TERMS_TEMPLATE = `1. Payment is due as scheduled below. The balance is due on completion.
2. Any change to the scope is handled by a written change order, agreed and signed before that work starts.
3. Workmanship is warranted for 24 months from completion. The manufacturer's material warranty passes to the owner at final payment.
4. Either party may cancel in writing within 3 business days of signing at no cost. After that, materials already ordered are billable.`;

/** Clients on file for the picker. Deliberately mixed: two complete records,
 *  one thin record with nothing but a name, one commercial account. */
export const SEED_CLIENTS: ClientRecord[] = [
  {
    id: "mc_cl_reyes",
    name: "Marisol & Dante Reyes",
    email: "m.reyes@example.com",
    phone: "(817) 555-0142",
    address: "2318 Bluebonnet Ln",
    city: "Fort Worth",
    state: "TX",
    zip: "76109",
    tags: ["Referral"],
  },
  {
    id: "mc_cl_okafor",
    name: "Ada Okafor",
    email: "ada@okaforproperties.example",
    phone: "(214) 555-0119",
    address: "704 N Cedar St",
    city: "Arlington",
    state: "TX",
    zip: "76011",
    tags: ["VIP"],
  },
  {
    // The thin record. Everything but the name is blank, which is what makes
    // the "No contact details on file." state reachable in one click instead
    // of something a reviewer has to construct.
    id: "mc_cl_trinity",
    name: "Trinity Vale Property Group",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    tags: [],
  },
  {
    id: "mc_cl_nguyen",
    name: "Thu Nguyen",
    email: "thu.nguyen@example.com",
    phone: "(469) 555-0177",
    address: "1155 Legacy Dr",
    city: "Plano",
    state: "TX",
    zip: "75023",
    tags: [],
  },
];

/** Projects on file for the picker. */
export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: "mc_pj_bluebonnet",
    name: "Reyes — Bluebonnet re-roof",
    description: "Full tear-off and re-roof, 28.5 squares, one existing layer of 3-tab.",
  },
  {
    id: "mc_pj_cedar",
    name: "Okafor — Cedar St duplex",
    description: "Gutter replacement and two skylight curbs.",
  },
  {
    id: "mc_pj_trinity",
    name: "Trinity Vale — 2026 maintenance",
    description: "Rolling repair work across nine managed buildings.",
  },
];

/**
 * Addresses the "Find" affordance offers. A fixture stand-in for the Places
 * lookup the live builder uses — same shape of interaction, none of the
 * network. Each carries its state so choosing one can move the tax estimate.
 */
export const ADDRESS_SUGGESTIONS: { label: string; state: string }[] = [
  { label: "2318 Bluebonnet Ln, Fort Worth, TX 76109", state: "TX" },
  { label: "704 N Cedar St, Arlington, TX 76011", state: "TX" },
  { label: "1155 Legacy Dr, Plano, TX 75023", state: "TX" },
  { label: "9 Ridgeline Ct, Edmond, OK 73013", state: "OK" },
  { label: "4412 Camelback Rd, Phoenix, AZ 85018", state: "AZ" },
];

/**
 * The seeded work. Numbers are a believable 28.5-square North Texas tear-off:
 * base cost lands at $13,621, which at the seeded 18% / 12% markups sells for
 * $15,609.10 pre-tax and $16,896.85 with Texas tax — $2,603.15 short of the
 * $19,500 target the draft opens with.
 */
const SEED_LINES: Line[] = [
  {
    id: "mc_ln_teardown",
    name: "Tear off one layer of 3-tab, haul and magnet sweep",
    description: "Drive, beds and lawn swept at the end of every working day.",
    unit: "SQFT",
    quantity: 2850,
    materialCost: 0,
    laborCost: 0.62,
  },
  {
    id: "mc_ln_shingle",
    name: "Architectural shingle · 30 yr, Weathered Timber",
    description: "Colour confirmed against the sample board on 07-29.",
    unit: "SQFT",
    quantity: 2850,
    materialCost: 1.46,
    laborCost: 1.92,
  },
  {
    id: "mc_ln_iw",
    name: "Ice & water shield · valleys and eaves",
    description: "",
    unit: "LINEAR_FT",
    quantity: 380,
    materialCost: 1.9,
    laborCost: 1.05,
  },
  {
    id: "mc_ln_dumpster",
    name: "Dumpster · 20 yd, permitted haul-off",
    description: "",
    unit: "UNIT",
    quantity: 2,
    materialCost: 505,
    laborCost: 45,
  },
  {
    // Unnamed ON PURPOSE — see the file header. This is the row empty state,
    // and it is the first thing a reviewer should see is intentional rather
    // than broken.
    id: "mc_ln_blank",
    name: "",
    description: "",
    unit: "UNIT",
    quantity: 1,
    materialCost: 0,
    laborCost: 0,
  },
];

/** The 30 / 30 / 40 split the brief specifies. Reconciles to 100% on load, so
 *  the coverage readout opens SETTLED and only breaks when you edit it — which
 *  is the honest way round for a meter nobody has touched yet. */
const SEED_INSTALLMENTS: Installment[] = [
  { id: "mc_in_deposit", label: "Deposit — on signing", amount: 30, isPercent: true },
  { id: "mc_in_start", label: "Start of work", amount: 30, isPercent: true },
  { id: "mc_in_final", label: "Completion", amount: 40, isPercent: true },
];

/** One staged file, so the chip grammar is visible on load. Removing it
 *  reveals the "No file chosen" empty state, which is one press away. */
const SEED_FILES: StagedFile[] = [
  {
    id: "mc_fl_elevations",
    name: "reyes-elevations.pdf",
    size: 412_776,
    kind: "application/pdf",
  },
];

/**
 * A fresh copy of the seed.
 *
 * Returned by a function rather than exported as a constant because "Reset to
 * the seeded draft" hands this straight back into state: a shared constant
 * would let one session's edits leak into the next reset through the nested
 * arrays.
 */
export function makeSeedDraft(): MarginDraft {
  return {
    title: "Reyes Residence — Full Roof Replacement",
    projectId: "mc_pj_bluebonnet",
    client: { mode: "record", id: "mc_cl_reyes" },
    address: "2318 Bluebonnet Ln, Fort Worth, TX 76109",
    description:
      "Complete tear-off of the existing shingle roof and installation of a new 30-year architectural system, including synthetic underlayment, ice and water protection at the valleys and eaves, and new pipe boots throughout.",
    lines: SEED_LINES.map((l) => ({ ...l })),
    taxPct: STATE_TAX.TX,
    taxAuto: true,
    taxState: "TX",
    markups: { ...DEFAULT_MARKUPS },
    targetTotal: 19500,
    scopeOfWork:
      "Remove the existing layer of 3-tab shingles down to the deck. Replace any deteriorated decking at the agreed unit rate. Install synthetic underlayment across the field, ice and water membrane in all valleys and two courses at the eaves, then the new architectural shingle with matching hip and ridge cap. Reflash the chimney and all penetrations, set new pipe boots, and install continuous baffled ridge vent.",
    notes:
      "Gutters stay as they are. The satellite dish comes down and goes back on the same mount. Access from the alley side; the driveway stays clear for the homeowner throughout.",
    terms: "",
    installments: SEED_INSTALLMENTS.map((i) => ({ ...i })),
    options: {
      hideBreakdown: false,
      laborOnly: false,
      showSignature: true,
      showScope: true,
    },
    files: SEED_FILES.map((f) => ({ ...f })),
  };
}
