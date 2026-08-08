// SPEC SHEET — fixtures. Route /dashboard/manual-spec.
//
// The data layer is out of scope until the layout is signed off: no Prisma, no
// server action, no network, and nothing from the live builder's Zustand draft
// store. Everything below is a plain constant, and every id carries the `mc_`
// prefix so it can never be mistaken for a real record.
//
// THE SEED IS DELIBERATELY PART-FILLED, because a spec sheet is judged on how
// it reads when it is FILLED IN — an empty page proves nothing about a
// label/value grammar — and because the partial states are part of the design.
// On first load:
//   · a real Texas client is attached, so the address-derived tax rate reads a
//     genuine 8.25% and the "Estimated from Texas ·" state is visible;
//   · four named lines with mixed units (sq ft / hour / linear ft) and a real
//     material-labor split, plus ONE DELIBERATELY UNNAMED LINE so the row
//     empty state and the "not issued" annotation are on screen from the start;
//   · one client on file (Rowan Ellis) carries no contact details at all, so
//     the picker's thin-record state is one click away;
//   · TERMS ARE EMPTY, so the terms sheet opens on its empty state and the
//     "Insert starter template" action has something to do;
//   · the payment schedule is the seeded 30 / 30 / 40, which reconciles — the
//     reconciliation readout therefore opens in its settled state and breaks
//     the moment a figure is touched.
//
// Texture is Dallas-Fort Worth roofing: a Frisco tear-off and re-roof.

import type {
  ClientRecord,
  Installment,
  ProjectRecord,
  SpecDraft,
  SpecFile,
  SpecLine,
} from "./manual-spec-types";

/* ─────────────────────────────────────────────────────────────
   Title-block identity. Fixed strings rather than `new Date()`:
   this tree is server-rendered before it hydrates, and a clock
   read during render is a guaranteed hydration mismatch.
   ───────────────────────────────────────────────────────────── */

/** Stands in for the org record. Printed as the sender on the issued sheet. */
export const ORG_NAME = "Northgate Roofing & Exteriors";
export const ORG_LINE = "TX RCAT #14027 · Frisco, TX · (469) 555-0186";

export const DRAWING_NO = "PR-2418";
export const ISSUE_DATE = "2026-08-07";
export const REVISION = "A";
/** How long the price holds. Printed on the issued sheet. */
export const VALID_DAYS = 30;

/* ─────────────────────────────────────────────────────────────
   The sheet index — ONE source for the sticky title block's sheet
   list, the card heads and the jump targets. Two lists would drift.
   ───────────────────────────────────────────────────────────── */

export type SheetMeta = {
  /** DOM id and jump target. */
  id: string;
  /** Sheet number printed in the label gutter of the card head. */
  no: string;
  /** Short code for the sticky index cells. */
  code: string;
  title: string;
  /** The one quiet line that says what this sheet is for. */
  teach: string;
};

export const SHEETS: SheetMeta[] = [
  {
    id: "sh-ident",
    no: "SH-01",
    code: "IDENT",
    title: "Identification",
    teach:
      "Who the proposal is for, what job it belongs to, and the address the tax rate is taken from.",
  },
  {
    id: "sh-work",
    no: "SH-02",
    code: "WORK",
    title: "Schedule of work",
    teach:
      "The priced lines. Quantity, unit and unit price stay on the rule; the cost split behind each line's own number.",
  },
  {
    id: "sh-basis",
    no: "SH-03",
    code: "BASIS",
    title: "Estimate basis",
    teach:
      "The four rates the price is built on, and the ledger that turns your cost into the client's subtotal.",
  },
  {
    id: "sh-scope",
    no: "SH-04",
    code: "SCOPE",
    title: "Scope & notes",
    teach: "What the crew is committing to, and what you want on the record beside it.",
  },
  {
    id: "sh-terms",
    no: "SH-05",
    code: "TERMS",
    title: "Terms & conditions",
    teach: "Payment terms, change orders, warranty and dispute resolution.",
  },
  {
    id: "sh-pay",
    no: "SH-06",
    code: "PAY",
    title: "Payment schedule",
    teach: "How the total gets paid, and whether the installments actually reconcile to it.",
  },
  {
    id: "sh-files",
    no: "SH-07",
    code: "FILES",
    title: "Attachments",
    teach: "Anything that rides along with the proposal. Staged here only — nothing is uploaded.",
  },
  {
    id: "sh-issue",
    no: "SH-08",
    code: "ISSUE",
    title: "Issue options",
    teach: "What the issued sheet prints. Every switch here changes SH-09 as you throw it.",
  },
  {
    id: "sh-issued",
    no: "SH-09",
    code: "SHEET",
    title: "Issued sheet",
    teach: "What the client receives. Not your workspace — their copy.",
  },
];

/* ─────────────────────────────────────────────────────────────
   Records on file
   ───────────────────────────────────────────────────────────── */

export const SEED_CLIENTS: ClientRecord[] = [
  {
    id: "mc_cl_alvarez",
    name: "Renata & Marco Alvarez",
    email: "r.alvarez@example.com",
    phone: "(469) 555-0142",
    address: "4218 Bluewood Trl",
    city: "Frisco",
    state: "TX",
    zip: "75034",
    tags: [],
  },
  {
    id: "mc_cl_nguyen",
    name: "Thuy Nguyen",
    email: "thuy.nguyen@example.com",
    phone: "(972) 555-0119",
    address: "1907 Copperfield Dr",
    city: "Plano",
    state: "TX",
    zip: "75023",
    tags: [],
  },
  {
    id: "mc_cl_okonkwo",
    name: "Okonkwo Property Group",
    email: "maint@okonkwopg.example",
    phone: "(214) 555-0177",
    address: "640 W Davis St",
    city: "Dallas",
    state: "TX",
    zip: "75208",
    tags: ["VIP"],
  },
  {
    // A thin record on purpose — picking this one shows the
    // "No contact details on file." state the live ClientField carries.
    id: "mc_cl_ellis",
    name: "Rowan Ellis",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    tags: [],
  },
];

export const SEED_PROJECTS: ProjectRecord[] = [
  {
    id: "mc_pj_bluewood",
    name: "Alvarez — Bluewood Trl re-roof",
    description: "Full tear-off and re-roof, 31.5 squares, two existing layers.",
  },
  {
    id: "mc_pj_copperfield",
    name: "Nguyen — Copperfield gutter run",
    description: "Gutter replacement and two skylight curbs.",
  },
  {
    id: "mc_pj_okonkwo",
    name: "Okonkwo PG — 2026 turn maintenance",
    description: "Rolling repair work across nine managed buildings.",
  },
];

/* ─────────────────────────────────────────────────────────────
   The tax estimate
   ───────────────────────────────────────────────────────────── */

/**
 * A FIXTURE lookup, not a tax service. Combined state + typical local rate for
 * the handful of states this lab's addresses can resolve to. The live builder
 * calls a real resolver; this page only has to prove the interaction — the
 * address sets an estimate, the estimate says where it came from, and a rate
 * typed by hand is never silently overwritten afterwards.
 */
export const STATE_TAX: Record<string, { name: string; pct: number }> = {
  TX: { name: "Texas", pct: 8.25 },
  WA: { name: "Washington", pct: 10.35 },
  CA: { name: "California", pct: 8.75 },
  FL: { name: "Florida", pct: 7.0 },
  AZ: { name: "Arizona", pct: 8.6 },
  CO: { name: "Colorado", pct: 8.31 },
  GA: { name: "Georgia", pct: 7.4 },
  NC: { name: "North Carolina", pct: 7.0 },
};

/** The org's saved default, used when an address resolves to nothing known. */
export const ORG_DEFAULT_TAX_PCT = 8.25;

/**
 * Pull a state out of a one-line address — "…, Frisco, TX 75034" — and return
 * the estimate it implies. Returns null when nothing resolves, which is the
 * signal to leave the current rate alone rather than guess.
 */
export function estimateTaxFromAddress(
  address: string,
): { code: string; name: string; pct: number } | null {
  const match = /\b([A-Za-z]{2})\b(?:\s*,)?\s*(?:\d{5}(?:-\d{4})?)?\s*$/.exec(address.trim());
  if (!match) return null;
  const code = match[1].toUpperCase();
  const hit = STATE_TAX[code];
  if (!hit) return null;
  return { code, name: hit.name, pct: hit.pct };
}

/** One-line address for a client record. Empty when the record is thin. */
export function clientAddressLine(client: ClientRecord): string {
  const street = client.address.trim();
  const tail = [client.city, [client.state, client.zip].filter(Boolean).join(" ")]
    .filter((p) => p.trim().length > 0)
    .join(", ");
  return [street, tail].filter((p) => p.length > 0).join(", ");
}

/* ─────────────────────────────────────────────────────────────
   Starter copy
   ───────────────────────────────────────────────────────────── */

/** Offered by the terms field while it is empty. The same three clauses the
 *  live builder's starter template carries. */
export const TERMS_TEMPLATE = `1. Payment due as scheduled below. Balance due on completion.
2. Changes to scope are handled by written change order before work starts.
3. Workmanship is warranted for 12 months from completion; the manufacturer warranty on materials passes to the owner at final payment.
4. Disputes are resolved by binding arbitration in Collin County, Texas.`;

/* ─────────────────────────────────────────────────────────────
   The seeded draft
   ───────────────────────────────────────────────────────────── */

const SEED_LINES: SpecLine[] = [
  {
    id: "mc_ln_tearoff",
    name: "Tear off two layers of 3-tab",
    description: "Includes a magnet sweep of the drive and beds at the end of every day.",
    unit: "SQFT",
    quantity: 3150,
    materialCost: 0,
    laborCost: 0.62,
  },
  {
    id: "mc_ln_deck",
    name: "Deck repair allowance · 1/2 in CDX",
    description: "Allowance — unused hours are credited back on the final invoice.",
    unit: "HOUR",
    quantity: 12,
    materialCost: 22.5,
    laborCost: 68,
  },
  {
    id: "mc_ln_shingle",
    name: "Architectural shingle system · 30 yr, Weathered Wood",
    description: "Colour confirmed against the sample board on 07-29.",
    unit: "SQFT",
    quantity: 3150,
    materialCost: 1.46,
    laborCost: 2.02,
  },
  {
    id: "mc_ln_ridge",
    name: "Ridge vent · continuous, baffled",
    description: "",
    unit: "LINEAR_FT",
    quantity: 74,
    materialCost: 7.6,
    laborCost: 4.35,
  },
  {
    // UNNAMED ON PURPOSE. This is the partial state the design has to survive:
    // the row prints its own empty state, the gutter annotates it as not
    // issued, and it is absent from SH-09 because a blank row has no business
    // on a document a homeowner signs.
    id: "mc_ln_blank",
    name: "",
    description: "",
    unit: "UNIT",
    quantity: 1,
    materialCost: 0,
    laborCost: 0,
  },
];

/** Seeded 30 / 30 / 40 — reconciles to the total, so the readout opens
 *  settled and breaks visibly the moment a figure is edited. */
const SEED_INSTALLMENTS: Installment[] = [
  { id: "mc_in_deposit", label: "Deposit", amount: 30, isPercent: true },
  { id: "mc_in_start", label: "Start of work", amount: 30, isPercent: true },
  { id: "mc_in_done", label: "Completion", amount: 40, isPercent: true },
];

const SEED_FILES: SpecFile[] = [
  { id: "mc_fl_elev", name: "alvarez-roof-elevations.pdf", size: 412_776 },
];

/**
 * A fresh copy of the seed. A function rather than a shared constant because
 * "Reset" hands this straight back into state — a shared object would let one
 * session's edits leak into the next reset.
 */
export function makeSeedDraft(): SpecDraft {
  return {
    title: "Alvarez Residence — Full Roof Replacement",
    description:
      "Complete tear-off of two existing shingle layers and installation of a new 30-year architectural roof system, including synthetic underlayment, ice and water protection at the valleys, and continuous ridge ventilation.",
    projectId: "mc_pj_bluewood",
    client: { mode: "record", id: "mc_cl_alvarez" },
    address: "4218 Bluewood Trl, Frisco, TX 75034",

    lines: SEED_LINES.map((l) => ({ ...l })),

    taxPct: 8.25,
    taxAuto: true,
    taxState: "Texas",

    markups: {
      // The live builder's defaults, so the ledger opens on the numbers a
      // contractor would recognise from the real estimate breakdown.
      materialMarkupPct: 18,
      laborMarkupPct: 12,
      overheadPct: 0,
      profitPct: 0,
    },
    options: {
      hideBreakdownCosts: false,
      laborOnly: false,
      showSignatureLines: true,
      showScopeOfWork: true,
    },

    scopeOfWork:
      "Remove existing shingles down to the deck, replace damaged sheathing on an hourly allowance, install synthetic underlayment over the full field with ice and water shield in the valleys, install architectural shingles per the manufacturer's high-wind nailing pattern, and finish with continuous baffled ridge vent.",
    notes:
      "Gutters stay as-is. The satellite dish comes down and goes back on the same mount. Access from the alley side; the driveway stays clear for the homeowner throughout.",
    // EMPTY ON PURPOSE — see the file header.
    terms: "",

    installments: SEED_INSTALLMENTS.map((i) => ({ ...i })),
    files: SEED_FILES.map((f) => ({ ...f })),
  };
}
