// WORKLIST — shapes only. No values, no React.
//
// Route: /dashboard/manual-worklist (manual proposal builder, card lab).
//
// THESIS (the whole folder builds this one bet)
// The page tells you what is LEFT. Eight cards sit in two bands: OPEN above a
// heavy labelled seam, SETTLED below it as one-line receipts. Every card owns
// an explicit done-condition; meeting it MOVES the card across the seam, so
// finishing work visibly removes it from view.
//
// Fixture-only: no Prisma, no server action, no network, no shared store.
// Top-level route on purpose — a nested route would inherit the parent's page
// key and stylesheet from the blueprint shell.
//
// A types-only module lets the math, the fixture and the six component files
// import the same shapes without dragging a component tree behind them.

/** The six measurement units the live builder offers, verbatim. */
export type Unit = "SQFT" | "LINEAR_FT" | "CUBIC_FT" | "UNIT" | "HOUR" | "LUMP_SUM";

/**
 * The eight cards on the worklist. A union rather than strings: the band map,
 * the done-conditions, the receipts and the undo entry are all keyed by this,
 * and a typo in any one of them would otherwise be a silent runtime hole.
 */
export type CardId =
  | "client"
  | "job"
  | "lines"
  | "pricing"
  | "payment"
  | "scope"
  | "terms"
  | "files";

/** Which side of the seam a card is drawn on. */
export type Band = "open" | "settled";

/**
 * One priced line.
 *
 * There is no stored `unitPrice`. Cost per unit is ALWAYS
 * `materialCost + laborCost`, which is what the live builder converges to
 * anyway (LineItemRow writes `unitPrice: material + labor` on every split
 * edit). Deriving it instead of storing it is what makes the estimate ledger
 * exact: "Base · materials" + "Base · labor" + the two markup rows can never
 * disagree with the line totals above them, because they are the same numbers.
 * The row still shows and edits a `$ cost / unit` figure — typing there scales
 * the split, preserving the material/labor ratio (see `scaleToCost`).
 *
 * `id` is stable across reorder and delete — never an array index, or removing
 * a row would re-key its neighbours and drop the caret out of a focused input.
 */
export type Line = {
  id: string;
  name: string;
  /** Optional. Prints under the name on the client's copy. */
  description: string;
  unit: Unit;
  quantity: number;
  /** Internal split, per unit, BEFORE markup. Never printed. */
  materialCost: number;
  laborCost: number;
};

/** The four draggable markup controls, as one object. */
export type Markups = {
  /** Markup over base materials. */
  materialMarkupPct: number;
  /** Markup over base labor. */
  laborMarkupPct: number;
  /** Of the marked-up subtotal. */
  overheadPct: number;
  /** Of cost + overhead. */
  profitPct: number;
};

/** A client on file. Field-for-field what the live builder round-trips. */
export type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  /** Free tags — "VIP" and friends. */
  tags: string[];
};

/** A project on file. */
export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
};

/**
 * The client field's three modes as ONE value rather than three booleans: the
 * modes are mutually exclusive, and a union makes the impossible combination
 * unrepresentable.
 *   none      — nothing chosen (the card is unmet)
 *   record    — an existing client, editable in place
 *   freeText  — a plain-text name for a client with no record
 */
export type ClientChoice =
  | { mode: "none" }
  | { mode: "record"; id: string }
  | { mode: "freeText"; name: string };

/** One payment installment. `amount` is a percent when `isPercent`, else $. */
export type Installment = {
  id: string;
  label: string;
  amount: number;
  isPercent: boolean;
};

/** The four presentation toggles. Every one of them changes the preview. */
export type ProposalOptions = {
  /** Print line totals only — keep the material/labor split internal. */
  hideBreakdown: boolean;
  /** Suppress material rows so the document reads as a pure labor quote. */
  laborOnly: boolean;
  /** Signature blocks at the foot of the document. */
  showSignature: boolean;
  /** Include the scope text on the printed copy. */
  showScope: boolean;
};

/** A file staged locally. Nothing is uploaded — there is no endpoint here. */
export type StagedFile = {
  id: string;
  name: string;
  size: number;
  kind: string;
};

/** Everything the worklist holds. One object, so the done-conditions, the
 *  receipts and the undo snapshot can all read the whole draft at once. */
export type Draft = {
  title: string;
  description: string;
  projectId: string | null;
  client: ClientChoice;
  /** Job address, one line. Optional, and freely editable after auto-fill. */
  address: string;
  lines: Line[];
  markups: Markups;
  /** A percentage as typed — 8.25 means 8.25%. */
  taxPct: number;
  /**
   * TRUE once the contractor has typed a rate by hand. A hand-typed rate is
   * NEVER silently overwritten by a later address change — same contract as
   * the live builder's `taxRateAuto`, inverted so the default is "estimated".
   */
  taxManual: boolean;
  /** Which state the current estimate came from, for the `Estimated from …`
   *  annotation. Null once the rate is manual or no state is known. */
  taxSourceState: string | null;
  /** The pricing card's done-condition: the rate was confirmed for THIS job. */
  taxConfirmed: boolean;
  installments: Installment[];
  options: ProposalOptions;
  scopeOfWork: string;
  notes: string;
  terms: string;
  files: StagedFile[];
  /**
   * The files card's done-condition. Attachments are optional, and an optional
   * section has no natural finish line — so the finish line is an explicit
   * acknowledgement. Without one, the card could never leave the open band and
   * the worklist would always read as unfinished.
   */
  filesConfirmed: boolean;
};

/** Every figure the ledger, the cards and the client's copy print. */
export type PriceSheet = {
  /** Per line, in draft order. Suppressed lines carry 0. */
  perLine: { id: string; sellUnit: number; total: number; suppressed: boolean }[];
  /** Raw cost before markup. */
  baseMaterials: number;
  baseLabor: number;
  baseTotal: number;
  materialMarkup: number;
  laborMarkup: number;
  /** Cost + both markups. The estimate ledger's "Subtotal" row. */
  subtotal: number;
  overhead: number;
  profit: number;
  /** Subtotal + overhead + profit. Pre-tax price — what the client sees as
   *  "Subtotal" on their copy. */
  grandTotal: number;
  tax: number;
  /** Grand total + tax. The one number the sticky ledger prints. */
  total: number;
  /** (grandTotal − baseTotal) / grandTotal, as a percent. */
  margin: number;
};

/** One card's worklist record. The bands, the seam counter, the NEXT tag and
 *  the receipts all render from this array, so they cannot disagree. */
export type CardState = {
  id: CardId;
  /** "01" … "08" — the drawing-annotation numeral. */
  num: string;
  /** The card's heading. */
  title: string;
  /** The done-condition, printed verbatim on the card's rule line. */
  rule: string;
  /** TRUE when the proposal cannot be sent until this card is settled. */
  blocking: boolean;
  /** Sort weight inside the open band. Lower sorts first. */
  priority: number;
  settled: boolean;
  /** What the settled receipt prints — CONTENT, never just the name. */
  summary: string;
};

/** The undo offer raised whenever a card crosses the seam. */
export type UndoEntry = {
  /** Bumped per transition, so the auto-dismiss timer restarts. */
  seq: number;
  cardId: CardId;
  direction: "settled" | "reopened";
  /** Why it moved, in the card's own words. */
  cause: string;
  /** The draft as it was immediately before the move. */
  before: { draft: Draft; clients: ClientRecord[]; projects: ProjectRecord[] };
};
