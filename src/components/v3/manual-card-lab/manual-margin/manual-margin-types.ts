// PRICE FIRST — shapes only. No values, no React, no imports.
// (route: /dashboard/manual-margin)
//
// Design thesis: a contractor does not build a scope and discover a price —
// they know the number they have to hit and reconcile the job against it. So
// the page is inverted: the PRICE CARD is card 01, everything under it is an
// input that feeds the number, and every card head states what it does to the
// number. These types are the contract that lets the math module, the fixture
// and the six card components all speak about the same draft without any of
// them importing a component tree.
//
// Fixture-only: nothing in this folder touches Prisma, a server action, the
// shared draft store or the network. Ids carry an `mc_` prefix so a value from
// here can never be mistaken for a real record.
//
// The route is TOP-LEVEL under /dashboard on purpose: a nested route would
// inherit its parent's page key and stylesheet from the blueprint shell, and
// this variant ships its own self-scoped CSS module instead.

/** The six measurement units the live builder offers, verbatim. */
export type Unit = "SQFT" | "LINEAR_FT" | "CUBIC_FT" | "UNIT" | "HOUR" | "LUMP_SUM";

/**
 * One priced line.
 *
 * `materialCost` / `laborCost` are PER UNIT and BEFORE markup — they are the
 * only cost facts stored. The `$` unit price shown on the row is DERIVED from
 * them through the four markup controls (see manual-margin-math.ts), which is
 * what keeps this page honest to its own thesis: there is exactly one grand
 * total and every control visibly moves it. Typing a unit price back-solves the
 * split rather than opening a second, disagreeing source of truth.
 *
 * `id` is stable across reorders and deletes — never an array index, or moving
 * a row would re-key its neighbours and drop the caret out of a focused field.
 */
export type Line = {
  id: string;
  name: string;
  /** Optional. Prints under the name on the client's copy. */
  description: string;
  unit: Unit;
  quantity: number;
  materialCost: number;
  laborCost: number;
};

/** A client on file. Field-for-field what the live builder's inline create and
 *  edit round-trip, so the picker here exercises the same surface. A thin
 *  record (everything but `name` blank) is legal and has its own empty state. */
export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  /** Free tags, e.g. VIP. Optional on create. */
  tags: string[];
};

/** A project on file. Created inline; never persisted. */
export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
};

/**
 * The client field's three input modes as ONE value rather than three
 * booleans — they are mutually exclusive, and a union makes an impossible
 * combination unrepresentable.
 *   none      — nothing chosen yet
 *   record    — an existing (or just-created) client, editable in place
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
 * Three of them change only what PRINTS. `laborOnly` is different and is
 * treated as a pricing decision here: a labor-only proposal genuinely is not
 * carrying the material cost, so it drops material out of the WHOLE
 * computation rather than hiding rows in the preview. One number, and the
 * toggle's consequence is stated in dollars on the options card head.
 */
export type ProposalOptions = {
  hideBreakdown: boolean;
  laborOnly: boolean;
  showSignature: boolean;
  showScope: boolean;
};

/** A file staged locally. Nothing is read and nothing is uploaded — there is
 *  no endpoint on this route and there is not going to be one. */
export type StagedFile = {
  id: string;
  name: string;
  size: number;
  kind: string;
};

/** The four markup controls, as the live builder names them. Percentages as
 *  typed: 18 means 18.0%. */
export type Markups = {
  /** Markup over base materials. */
  materialMarkupPct: number;
  /** Markup over base labor. */
  laborMarkupPct: number;
  /** Of subtotal (materials + labor, after their markups). */
  overheadPct: number;
  /** Of cost + overhead. */
  profitPct: number;
};

/** Everything the sheet holds. One object rather than twenty useStates: the
 *  price card, the reconciliation, the autosave signature and the reset
 *  affordance all want to read the whole draft at once. */
export type MarginDraft = {
  title: string;
  projectId: string | null;
  client: ClientChoice;
  /** One line, optional. Auto-fills from the client and drives the tax
   *  estimate, but stays freely editable. */
  address: string;
  description: string;
  lines: Line[];
  /** A percentage as typed — 8.25 means 8.25%. */
  taxPct: number;
  /** True while the rate is still the address-derived estimate. Flips to false
   *  the moment the contractor types a rate, and a later address change then
   *  NEVER silently overwrites it. */
  taxAuto: boolean;
  /** Two-letter state the estimate came from, for the "Estimated from Texas ·"
   *  provenance chip. Null when the rate was never address-derived. */
  taxState: string | null;
  markups: Markups;
  /** The number the job has to hit, tax in. Null when no target is set — the
   *  page still works, it just has nothing to reconcile against. */
  targetTotal: number | null;
  scopeOfWork: string;
  notes: string;
  terms: string;
  installments: Installment[];
  options: ProposalOptions;
  files: StagedFile[];
};

/**
 * Every figure the page prints, computed in one pass so the price card, the
 * ledger, the composition bar, the card heads, the payment coverage and the
 * client's copy can never disagree about a number.
 */
export type Totals = {
  /** Base cost, before any markup. Materials are zero under labor-only. */
  baseMaterials: number;
  baseLabor: number;
  baseCost: number;

  /** Base after each side's own markup. */
  materialsAfter: number;
  laborAfter: number;
  /** What each markup ADDS in dollars — the ledger prints these, not the
   *  marked-up figures, because "+ Materials markup (18.0%)" is a delta. */
  materialMarkupAdded: number;
  laborMarkupAdded: number;

  /** Ledger row "Subtotal": materials + labor, after their markups. */
  subtotalCosts: number;
  overheadAmount: number;
  /** The base profit is taken from: subtotal + overhead. */
  subtotalWithOverhead: number;
  profitAmount: number;

  /** Ledger row "Grand total" — the pre-tax sell price. This is exactly what
   *  the client's copy calls "Subtotal". */
  grandTotal: number;
  tax: number;
  /** Grand total + tax. THE number: what the homeowner signs for, what the
   *  target is compared against, what the payment schedule splits. */
  contractTotal: number;

  /** (grandTotal − baseCost) / grandTotal, as a percent. Pre-tax, because tax
   *  is not yours and counting it would flatter the margin. */
  margin: number;

  /** Per-line sell price, pre-tax, penny-reconciled to add up to grandTotal
   *  exactly. `share` is the line's slice of contractTotal, 0–100. */
  perLine: { id: string; sell: number; share: number }[];
};

/**
 * The five bands the contract total decomposes into. They are mutually
 * exclusive and sum to contractTotal, which is what makes the composition bar
 * and the per-card contribution percentages honest rather than decorative.
 */
export type Composition = {
  cost: number;
  markup: number;
  overhead: number;
  profit: number;
  tax: number;
};

/** What the "reach the target" reconciliation resolves to. Computed on every
 *  render; applied only when the contractor presses Apply. */
export type Reconciliation =
  | { kind: "none" }
  | { kind: "onTarget"; target: number }
  | { kind: "short"; target: number; gap: number }
  | { kind: "over"; target: number; gap: number };

/** The honest solve: what profit percentage would land the contract total on
 *  the target, and whether that is a thing this control can actually do. */
export type ProfitSolve =
  | { kind: "unavailable"; reason: string }
  | { kind: "ready"; profitPct: number }
  | { kind: "outOfRange"; profitPct: number; max: number };
