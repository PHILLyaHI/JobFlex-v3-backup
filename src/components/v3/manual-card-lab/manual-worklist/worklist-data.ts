// WORKLIST — fixtures. The data layer is out of scope until the layout is
// signed off: no Prisma, no server action, no network, no shared store.
// Everything below is a plain constant, and every id carries the `mc_` prefix
// so it can never be mistaken for a real record.
//
// THE SEED IS DELIBERATELY HALF-FINISHED, because a worklist with nothing left
// on it proves nothing. On first load the ledger reads "4 OF 8 SETTLED":
//
//   OPEN (above the seam, in priority order)
//     03 LINE ITEMS   — one line has no name          ← blocking, carries NEXT
//     04 PRICING      — the tax rate is not confirmed
//     07 TERMS        — nothing written
//     08 FILES        — attachments not confirmed
//   SETTLED (below the seam, as one-line receipts)
//     01 CLIENT · 02 THE JOB · 05 PAYMENT · 06 SCOPE
//
// So a reviewer sees both bands populated, one blocking card, one NEXT tag,
// four receipts, and the group of empty/partial states the brief asks for:
//   - an unnamed line item (the line-row empty state),
//   - a client on file with no contact details ("Thu Nguyen"),
//   - an empty Terms field with its starter-template offer,
//   - Overhead and Profit at 0.0%, which must look chosen rather than broken.
//
// Texas, because the tax estimate has to read non-zero and the inventory's
// annotation is literally `Estimated from Texas ·`.

import type {
  ClientRecord,
  Draft,
  Installment,
  Line,
  ProjectRecord,
} from "./worklist-types";

/** Shown as the sender on the client's copy. Stands in for the org record. */
export const ORG_NAME = "Northgate Roofing & Exteriors";
export const ORG_LINE = "Austin, TX · Lic. #TX-RC-40912 · (512) 555-0100";

/** Drawing-annotation header values. Fixed strings rather than `new Date()`:
 *  this tree is server-rendered before it hydrates, and a clock read during
 *  render is a guaranteed hydration mismatch. */
export const PROPOSAL_NO = "MW-2041";
export const PROPOSAL_DATE = "2026-08-07";
export const VALID_DAYS = 30;

/** The org's saved markup defaults, offered back by "Save these as company
 *  defaults" and used by Reset. */
export const ORG_DEFAULT_MARKUPS = {
  materialMarkupPct: 18,
  laborMarkupPct: 12,
  overheadPct: 0,
  profitPct: 0,
};

/**
 * State-level sales-tax estimates, in percent. A tiny local fixture standing in
 * for `src/lib/pricing/salesTax.ts` — the lab must not import the live pricing
 * table, because that module is wired to the real draft store.
 */
export const STATE_TAX_PCT: Record<string, number> = {
  TX: 8.25,
  WA: 10.35,
  CA: 8.75,
  AZ: 8.4,
  FL: 7.0,
  NV: 8.375,
  CO: 7.65,
  GA: 7.35,
  OK: 8.99,
  NM: 7.72,
  LA: 9.55,
  NC: 6.98,
};

/** Full names for the `Estimated from Texas ·` annotation. */
export const STATE_NAME: Record<string, string> = {
  TX: "Texas",
  WA: "Washington",
  CA: "California",
  AZ: "Arizona",
  FL: "Florida",
  NV: "Nevada",
  CO: "Colorado",
  GA: "Georgia",
  OK: "Oklahoma",
  NM: "New Mexico",
  LA: "Louisiana",
  NC: "North Carolina",
};

/**
 * Pull a 2-letter state code out of a one-line address.
 *
 * Deliberately conservative: it only accepts a code that appears as its own
 * word AND is one we actually have a rate for. A loose match would find "OR"
 * inside "ORCHARD" and quietly re-estimate the tax on a Texas job.
 */
export function stateFromAddress(line: string): string | null {
  const words = line.toUpperCase().match(/\b[A-Z]{2}\b/g);
  if (!words) return null;
  for (let i = words.length - 1; i >= 0; i -= 1) {
    if (STATE_TAX_PCT[words[i]] !== undefined) return words[i];
  }
  return null;
}

/** Boilerplate offered by the Terms card while the field is empty. */
export const TERMS_TEMPLATE = `1. Payment is due on the schedule below. The balance is due on completion.
2. Any change to the scope is handled by a written change order agreed before that work starts.
3. Workmanship is warranted for 12 months from completion. The manufacturer warranty on materials passes to the owner at final payment.
4. This proposal is valid for ${VALID_DAYS} days from the date above.`;

/** Clients on file for the picker. `mc_cl_nguyen` is deliberately thin — it is
 *  the record that produces the "No contact details on file." empty state. */
export const SEED_CLIENTS: ClientRecord[] = [
  {
    id: "mc_cl_patel",
    name: "Anaya & Dev Patel",
    email: "anaya.patel@example.com",
    phone: "(512) 555-0142",
    address: "1408 Hollow Creek Dr",
    city: "Austin",
    state: "TX",
    zip: "78704",
    tags: ["VIP"],
  },
  {
    id: "mc_cl_reyes",
    name: "Reyes Property Group",
    email: "maint@reyespg.example",
    phone: "(512) 555-0184",
    address: "900 Congress Ave, Ste 210",
    city: "Austin",
    state: "TX",
    zip: "78701",
    tags: ["Repeat"],
  },
  {
    id: "mc_cl_nguyen",
    name: "Thu Nguyen",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    tags: [],
  },
  {
    id: "mc_cl_okafor",
    name: "Ada Okafor",
    email: "ada@okaforholdings.example",
    phone: "(210) 555-0119",
    address: "227 W Craig Pl",
    city: "San Antonio",
    state: "TX",
    zip: "78212",
    tags: [],
  },
];

/** Projects on file for the picker. */
export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: "mc_pj_hollow",
    name: "Patel — Hollow Creek re-roof",
    description: "Full tear-off and re-roof, 24 squares, one existing layer.",
  },
  {
    id: "mc_pj_reyes",
    name: "Reyes PG — 2026 turnover work",
    description: "Rolling repair and make-ready across nine managed buildings.",
  },
  {
    id: "mc_pj_craig",
    name: "Okafor — Craig Place duplex",
    description: "Gutter replacement and two skylight curbs.",
  },
];

/**
 * Addresses the job-address `Find` control offers. Local only — the live
 * builder reaches Google Places through `blueprint-shell/places-suggest`, and
 * a lab page may not make a network call, so the suggestion list is a fixture.
 */
export const ADDRESS_BOOK: string[] = [
  "1408 Hollow Creek Dr, Austin, TX 78704",
  "900 Congress Ave, Ste 210, Austin, TX 78701",
  "227 W Craig Pl, San Antonio, TX 78212",
  "5511 Balcones Dr, Austin, TX 78731",
  "2109 Cedar Bend Rd, Round Rock, TX 78664",
];

/**
 * The seeded work: a believable 24-square Austin tear-off.
 *
 * The last row has no name ON PURPOSE. It is the line-item empty state, it is
 * what keeps card 03 open and blocking on first load, and it is the single
 * clearest demonstration of the thesis — name it, blur, and the card crosses
 * the seam in front of you.
 */
const SEED_LINES: Line[] = [
  {
    id: "mc_ln_teardown",
    name: "Tear off one layer of 3-tab",
    description: "Includes a magnet sweep of the drive and beds at the end of each day.",
    unit: "SQFT",
    quantity: 2400,
    materialCost: 0,
    laborCost: 0.62,
  },
  {
    id: "mc_ln_underlay",
    name: "Synthetic underlayment · 10 sq rolls",
    description: "",
    unit: "UNIT",
    quantity: 3,
    materialCost: 96,
    laborCost: 28,
  },
  {
    id: "mc_ln_shingle",
    name: "Architectural shingle · 30 yr, Sierra Gray",
    description: "Colour confirmed against the sample board on 07-31.",
    unit: "SQFT",
    quantity: 2400,
    materialCost: 1.48,
    laborCost: 1.92,
  },
  {
    id: "mc_ln_ridge",
    name: "Ridge vent · continuous, baffled",
    description: "",
    unit: "LINEAR_FT",
    quantity: 62,
    materialCost: 7.6,
    laborCost: 4.25,
  },
  {
    id: "mc_ln_unnamed",
    name: "",
    description: "",
    unit: "UNIT",
    quantity: 1,
    materialCost: 0,
    laborCost: 0,
  },
];

/** The 30 / 30 / 40 split the brief asks for. Reconciles to 100%, so the
 *  payment card opens SETTLED and the settled band is populated on load. */
const SEED_INSTALLMENTS: Installment[] = [
  { id: "mc_in_deposit", label: "Deposit — on signing", amount: 30, isPercent: true },
  { id: "mc_in_start", label: "Start of work", amount: 30, isPercent: true },
  { id: "mc_in_final", label: "Completion", amount: 40, isPercent: true },
];

/**
 * A fresh copy of the seed. A function rather than an exported constant
 * because "Reset" hands this straight back into state: a shared constant would
 * let one session's edits leak into the next reset.
 */
export function makeSeedDraft(): Draft {
  return {
    title: "Patel Residence — Roof Replacement",
    description:
      "Complete tear-off of the existing shingle layer and installation of a new 30-year architectural roof system, including synthetic underlayment, new flashings and continuous ridge ventilation.",
    projectId: "mc_pj_hollow",
    client: { mode: "record", id: "mc_cl_patel" },
    address: "1408 Hollow Creek Dr, Austin, TX 78704",
    lines: SEED_LINES.map((l) => ({ ...l })),
    markups: { ...ORG_DEFAULT_MARKUPS },
    taxPct: STATE_TAX_PCT.TX,
    taxManual: false,
    taxSourceState: "TX",
    taxConfirmed: false,
    installments: SEED_INSTALLMENTS.map((i) => ({ ...i })),
    options: {
      hideBreakdown: false,
      laborOnly: false,
      showSignature: true,
      showScope: true,
    },
    scopeOfWork:
      "Remove one existing layer of 3-tab shingles down to the deck and haul away. Replace any deteriorated decking found, billed at the allowance rate. Install synthetic underlayment across the full field, ice-and-water membrane in both valleys, new drip edge and pipe boots, then 30-year architectural shingles and a continuous baffled ridge vent. Clean the site daily and magnet-sweep the drive on completion.",
    notes:
      "Gutters stay as-is. The satellite dish comes down and goes back on the same mount. Access from the alley side; the driveway stays clear for the homeowner.",
    terms: "",
    files: [
      {
        id: "mc_fl_elevations",
        name: "patel-elevations.pdf",
        size: 412_776,
        kind: "application/pdf",
      },
    ],
    filesConfirmed: false,
  };
}
