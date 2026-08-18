// CLIENT DETAIL / BLUEPRINT — the row shapes and the two pure helpers.
//
// THIS FILE HOLDS NO RECORDS. It used to carry a demo fixture — a whole
// invented client with six proposals, six payments and eight activity lines —
// which ./client-detail-load.ts returned whenever the `?client=` id was absent
// or resolved to nothing. That made a stale link render a fabricated person's
// name, address, billing terms and payment history as though the org owned the
// record. The loader now returns a NOT-FOUND view instead and the page draws an
// empty state, so nothing on this surface is invented.
//
// DATES ARE PRE-FORMATTED STRINGS, not Date objects. These types are consumed by
// a client component that Next also renders on the server; a `Date` formatted at
// render time is a hydration mismatch waiting for the first machine whose clock
// or timezone disagrees. A string renders identically in both places — which is
// why ./client-detail-load.ts formats on the server.
//
// The KPI figures are NOT stored here. They are derived from the loaded arrays
// in the content component, so a headline number can never go stale.

export type ProposalStatus = "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "DECLINED";
export type PaymentStatus = "PAID" | "PENDING" | "FAILED";

/** The chip set over the proposal ledger. `all` is the resting filter. */
export type ProposalFilter = "all" | "draft" | "open" | "won" | "lost";

export type ClientRecord = {
  recordNo: string;
  name: string;
  initials: string;
  company: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  since: string;
  lastContact: string;
  tags: string[];
  /** The Client.notes column, or "—". Fills the band's fourth fact slot. */
  notes: string;
};

export type ProposalRow = {
  id: string;
  title: string;
  status: ProposalStatus;
  amount: number;
  /** Last movement on the record, already formatted. */
  updated: string;
  /** The drawing-annotation reference printed on the sheet. */
  ref: string;
};

export type PaymentRow = {
  id: string;
  amount: number;
  /** How it arrived — provider first, instrument second. */
  method: string;
  instrument: string;
  date: string;
  status: PaymentStatus;
};

export type ActivityRow = {
  id: string;
  /** Sprite id, verified present in blueprint-shell's sprite. */
  icon: string;
  text: string;
  stamp: string;
};

/** Which chip a proposal answers to. `open` is everything still in play. */
export function bucketOf(status: ProposalStatus): Exclude<ProposalFilter, "all"> {
  if (status === "DRAFT") return "draft";
  if (status === "ACCEPTED") return "won";
  if (status === "DECLINED") return "lost";
  return "open";
}

/* ── THE ADDRESS, IN TWO LINES ────────────────────────────────────────────
   Client has ONE address column and the Edit dialog asks for two lines, so
   the second line is stored as the second line OF THAT COLUMN. A newline is
   the only separator that survives a round trip: splitting on commas is how
   "Suite B, Building 2" gets quietly rearranged by an edit nobody made.

   Both helpers live HERE and not in ./client-detail-load.ts because the
   dialog is a client component and the loader imports Prisma — one import of
   the loader from the browser bundle and the whole database client goes with
   it.
   ──────────────────────────────────────────────────────────────────────── */

/** Column value → the two lines the form edits. */
export function splitAddress(raw: string | null | undefined): { line1: string; line2: string } {
  const lines = (raw ?? "").split(/\r?\n/);
  return { line1: (lines[0] ?? "").trim(), line2: lines.slice(1).join(" ").trim() };
}

/** The two lines the form edits → one column value. */
export function joinAddress(line1: string, line2: string): string {
  const a = line1.trim();
  const b = line2.trim();
  return b ? `${a}\n${b}` : a;
}

/** Whole dollars, hand-rolled. `toLocaleString` depends on the runtime's ICU
 *  build, and this string is produced on the server AND in the browser. */
export function money(n: number): string {
  const whole = Math.round(Math.abs(n))
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "−" : ""}$${whole}`;
}
