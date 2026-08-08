// SPEC SHEET — shapes. Route /dashboard/manual-spec.
//
// THESIS (why these shapes and not the live builder's)
// A proposal is a technical specification, so this variant renders the whole
// column as ONE filled-in spec sheet: every card is a sheet-section, and every
// value inside it sits on a strict two-track grammar — a fixed mono LABEL
// GUTTER and an ink VALUE TRACK typed straight onto a rule. The data model
// below is deliberately flat for that reason: a spec sheet has no nesting, so
// there are no line GROUPS here (the live builder has none either) and no
// derived duplicates. `unitPrice` in particular is NOT stored — it is always
// material + labor, so storing it would create a second truth that a spec
// sheet cannot tolerate.
//
// FIXTURE ONLY. Nothing in this folder touches Prisma, a server action, the
// shared Zustand draft store, or the network. Every seeded id carries the
// `mc_` prefix so it can never be mistaken for a real record.
//
// Top-level route on purpose: a nested route would inherit its parent's page
// key and stylesheet from the blueprint shell, and this page ships its own
// self-scoped CSS module instead.

/** How a line is measured. The six values the live builder offers, in order. */
export type Unit = "SQFT" | "LINEAR_FT" | "CUBIC_FT" | "UNIT" | "HOUR" | "LUMP_SUM";

/**
 * One priced line of the schedule of work.
 *
 * `materialCost` / `laborCost` are per-unit COST — the internal split that
 * lives behind the row's "cost breakdown · per unit" disclosure. The client
 * never sees them. The row's visible UNIT $ is derived from them (see
 * `sellUnitPrice` in manual-spec-math.ts) and is editable by back-solving,
 * which is why the split is stored unrounded: rounding it to cents would make
 * the derived UNIT $ jitter by a cent while the field is being typed in.
 */
export type SpecLine = {
  id: string;
  name: string;
  /** Optional. Appears under the name on the proposal. */
  description: string;
  unit: Unit;
  quantity: number;
  materialCost: number;
  laborCost: number;
};

/** One payment milestone. `isPercent` switches `amount` between % and $. */
export type Installment = {
  id: string;
  label: string;
  amount: number;
  isPercent: boolean;
};

/** A file staged on the proposal. Local only — nothing is ever uploaded. */
export type SpecFile = {
  id: string;
  name: string;
  /** Raw bytes, formatted at display time. */
  size: number;
};

/** A client on file. A thin record (no email/phone/address) is a real state
 *  the picker has to survive, so the fixture ships one. */
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

/** A project the proposal can be filed under. */
export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
};

/**
 * Who the proposal is for. Three modes, matching the live ClientField:
 *   record   — an existing client
 *   freeText — a plain-text name for someone with no record
 *   none     — nothing chosen yet
 */
export type ClientChoice =
  | { mode: "record"; id: string }
  | { mode: "freeText"; name: string }
  | { mode: "none" };

/** The four client-facing render toggles. */
export type SpecOptions = {
  hideBreakdownCosts: boolean;
  laborOnly: boolean;
  showSignatureLines: boolean;
  showScopeOfWork: boolean;
};

/** The four percentages the estimating engine applies. 0-100, not 0-1. */
export type Markups = {
  materialMarkupPct: number;
  laborMarkupPct: number;
  overheadPct: number;
  profitPct: number;
};

/** The whole draft. One object so any sheet can render any slice of it. */
export type SpecDraft = {
  title: string;
  description: string;
  projectId: string | null;
  client: ClientChoice;
  /** One-line job address. Its resolved state drives the tax estimate. */
  address: string;

  lines: SpecLine[];

  /** Percent, not a decimal — the field asks for "7.5 for 7.5%". */
  taxPct: number;
  /** True while the rate came from the address estimate; false once typed. */
  taxAuto: boolean;
  /** The state the estimate resolved from, for "Estimated from Texas ·". */
  taxState: string | null;

  markups: Markups;
  options: SpecOptions;

  scopeOfWork: string;
  notes: string;
  terms: string;

  installments: Installment[];
  files: SpecFile[];
};

/**
 * Per-line client-facing figures, index-aligned with `draft.lines`.
 * `amount` is penny-reconciled against the grand total — see computeTotals.
 */
export type LineFigure = {
  id: string;
  /** Client-facing sell price for one unit, after markup, overhead and profit. */
  unitSell: number;
  /** quantity x unitSell, adjusted so the column sums to the grand total. */
  amount: number;
  /** Raw per-unit cost — the number the material/labor ratio is taken over. */
  unitCost: number;
  /** material / (material + labor), as a percent. 50 when there is no cost. */
  materialSharePct: number;
};

/** Every figure the sheet prints, computed in one pass. */
export type Totals = {
  perLine: LineFigure[];
  /** Sum of quantity x material cost. Zeroed on a labor-only issue. */
  baseMaterials: number;
  /** Sum of quantity x labor cost. */
  baseLabor: number;
  /** What the materials markup percentage adds, in dollars. */
  materialsMarkup: number;
  /** What the labor markup percentage adds, in dollars. */
  laborMarkup: number;
  /** base + both markups. The ledger's "Subtotal" row. */
  estimateSubtotal: number;
  overhead: number;
  profitAllowance: number;
  /** estimateSubtotal + overhead + profit. Pre-tax price to the client, and
   *  the same number the issued sheet prints as its Subtotal. */
  grandTotal: number;
  tax: number;
  /** grandTotal + tax. The one figure the sticky title block carries. */
  total: number;
  /** (grandTotal - direct cost) / grandTotal, as a percent. */
  margin: number;
};

/** Save / send chrome state. UI only — this page writes nothing. */
export type SaveState = "idle" | "working" | "done";
