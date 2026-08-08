// PROOF CARD — shapes only (route: /dashboard/manual-proof).
//
// THESIS (shared by every file in this folder)
// Every card on the page ends with a PROOF FOOTER that states, in plain
// arithmetic, what that card contributes to the price. Read only the footers,
// top to bottom, and you have read the whole estimate as a running derivation
// ending in the grand total on the last card. Nothing about the price is a
// surprise at the bottom, because the bottom is where the derivation FINISHES,
// not where it happens.
//
// This file is types only — no values, no React. The math module, the fixture
// and all six component files need the same shapes, and a types-only file lets
// each import without dragging a component tree behind it.
//
// Fixture-only page: every id here is carried by a `mc_`-prefixed constant in
// manual-proof-data.ts and never touches a database.

/** The six measurement units the live builder offers, verbatim. */
export type Unit = "SQFT" | "LINEAR_FT" | "CUBIC_FT" | "UNIT" | "HOUR" | "LUMP_SUM";

/**
 * One priced line.
 *
 * `unitPrice` is the BASE cost of one unit and is always kept equal to
 * `materialCost + laborCost` — the row shows it as the `$` figure, and editing
 * it rescales the two halves in place (see `rescaleUnitPrice` in the math
 * module). Two ways into one number, never two numbers that can disagree.
 *
 * `id` is stable across a reorder or a delete — never an array index, or
 * removing a row would re-key its neighbours and drop the caret out of
 * whichever field was focused.
 */
export type LineItem = {
  id: string;
  name: string;
  /** Optional. Prints under the name on the client's copy. */
  description: string;
  unit: Unit;
  quantity: number;
  /** Base cost per unit, before any markup. Mirrors materialCost + laborCost. */
  unitPrice: number;
  /** The internal split. Lives behind the row's "cost breakdown · per unit". */
  materialCost: number;
  laborCost: number;
};

/** A client on file. Field-for-field what the live builder's inline
 *  create/edit round-trips, so this picker exercises the same surface. */
export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  /** Two-letter code. Drives the tax-rate estimate — see STATE_TAX. */
  state: string;
  zip: string;
  /** Free labels, e.g. "VIP". Optional on create. */
  tags: string[];
};

/** A project on file. */
export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
};

/**
 * The client field's three input modes as ONE value rather than three
 * booleans: the modes are mutually exclusive, and a union makes an impossible
 * combination unrepresentable.
 *   none      — nothing chosen yet
 *   record    — an existing client, editable in place
 *   freeText  — a plain-text name for a client with no record
 */
export type ClientChoice =
  | { mode: "none" }
  | { mode: "record"; id: string }
  | { mode: "freeText"; name: string };

/** One payment installment. `amount` is a percent when `isPercent`, dollars
 *  otherwise — the same shape the live builder persists. */
export type Installment = {
  id: string;
  label: string;
  amount: number;
  isPercent: boolean;
};

/**
 * The four presentation toggles.
 *
 * Three of them change only what PRINTS. `laborOnly` is different and this page
 * is honest about it: suppressing the material-only rows removes their money
 * from the quote, so it is priced as a scope filter at the top of the money
 * spine and the options card's own proof footer states the deduction. A toggle
 * that quietly moved the total without saying so is exactly the surprise this
 * design exists to kill.
 */
export type ProposalOptions = {
  hideBreakdown: boolean;
  laborOnly: boolean;
  showSignature: boolean;
  showScope: boolean;
};

/** A file staged locally. Nothing is uploaded — there is no endpoint here. */
export type StagedFile = {
  id: string;
  name: string;
  /** Bytes. Printed by `fileSize()`. */
  size: number;
};

/** The four estimate-breakdown controls, as percentages the user typed
 *  (18 means 18%). */
export type Markups = {
  /** Markup over base material cost. */
  materialMarkupPct: number;
  /** Markup over base labor cost. */
  laborMarkupPct: number;
  /** Of the marked-up subtotal. */
  overheadPct: number;
  /** Of cost + overhead. */
  profitPct: number;
};

/** Everything the page holds. One object rather than twenty useStates: the
 *  derivation bar, every proof footer and the client's copy all want to read
 *  the whole draft at once, and one object means one source for all of them. */
export type ProofDraft = {
  title: string;
  description: string;
  projectId: string;
  client: ClientChoice;
  address: string;
  lines: LineItem[];
  /** A percentage as typed — 8.25 means 8.25%. */
  taxPct: number;
  /** True while the rate is still the address estimate. Flips to false the
   *  moment the user types a rate, and a later address change then leaves the
   *  hand-set number alone. */
  taxAuto: boolean;
  /** Two-letter state the estimate came from, for "Estimated from Texas ·".
   *  Empty when no address has ever resolved to a known state. */
  taxState: string;
  markups: Markups;
  installments: Installment[];
  options: ProposalOptions;
  scopeOfWork: string;
  notes: string;
  terms: string;
  files: StagedFile[];
};

/**
 * Every figure the page prints, computed in one pass.
 *
 * The names are the derivation, in order:
 *   base  →  + uplift  =  sellSubtotal  →  + tax  =  total
 * which is exactly the sentence the proof footers spell out down the column.
 */
export type Totals = {
  /** Lines that carry money into the quote. */
  pricedLines: LineItem[];
  /** Lines a labor-only quote drops (pure material, no labor). */
  suppressedLines: LineItem[];
  /** What those dropped lines would have added at base. */
  suppressedBase: number;

  baseMaterials: number;
  baseLabor: number;
  /** Card 02's contribution: the raw cost of the priced work. */
  base: number;

  materialsAfter: number;
  laborAfter: number;
  materialsMarkup: number;
  laborMarkup: number;
  /** The estimate ledger's "Subtotal" row: base + both markups. */
  subtotalCosts: number;
  overhead: number;
  profit: number;
  /** The estimate ledger's "Grand total", and the client's "Subtotal". */
  sellSubtotal: number;
  /** Card 03's contribution: markups + overhead + profit, in dollars. */
  uplift: number;
  /** (sellSubtotal − base) / sellSubtotal, as a percentage. */
  margin: number;

  /** Card 04's contribution. */
  tax: number;
  /** The number the client signs for. The last footer on the page. */
  total: number;
};

/** How the derivation classifies one card. The two footer species read
 *  differently on purpose — see the footer note in proof-card.tsx. */
export type FootKind = "money" | "cover";

/** One card's identity in the column. The cards render from this array and so
 *  does the derivation bar's jump chain, so the two can never disagree about
 *  what card 03 is called. */
export type CardMeta = {
  /** "01" … "09" — the drawing-annotation numeral. */
  num: string;
  /** Anchor id, used by the derivation bar's jump buttons and scroll-margin. */
  id: string;
  /** The card's own heading. */
  title: string;
  /** One quiet line saying what question this card answers. */
  teach: string;
  /** Money cards carry an ink numeral plate; coverage cards do not. */
  kind: FootKind;
};
