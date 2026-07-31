// Shapes for the manual builder, kept types-only on purpose.
//
// No values and no React in this file, so the desktop workspace, the pure
// totals module and the handheld twin can all import it without dragging a
// component tree along behind them.

/** One priced line on the sheet. `id` is stable across reorders — never an index. */
export type Row = {
  id: string;
  desc: string;
  qty: number;
  unit: string;
  cost: number;
};

/** A named group of lines: Materials, Labor, Equipment, Other, or user-added. */
export type Section = {
  id: string;
  name: string;
  rows: Row[];
};

/** The three percentages applied on top of the line subtotal. */
export type Rates = {
  markupPct: number;
  taxPct: number;
  contingencyPct: number;
};

/** The drawing title block at the head of the sheet. */
export type EstimateHeader = {
  client: string;
  project: string;
  address: string;
  number: string;
  date: string;
  trade: string;
  validDays: number;
};

/** One saved, priced item in the price book. */
export type BookItem = {
  id: string;
  name: string;
  unit: string;
  cost: number;
};

/** A trade grouping of book items. */
export type BookGroup = {
  id: string;
  name: string;
  items: BookItem[];
};

/** A whole section worth inserting in one action. */
export type Template = {
  id: string;
  name: string;
  section: Section;
};

/** Everything the totals rail draws. Computed, never stored. */
export type Totals = {
  perSection: { id: string; name: string; subtotal: number }[];
  subtotal: number;
  markup: number;
  contingency: number;
  tax: number;
  grand: number;
};
