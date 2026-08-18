// Mobile clients (mobile-clients-v2) — the row shape and the pure list helpers.
//
// THIS FILE HOLDS NO RECORDS. It used to carry an eighteen-row demo book copied
// from the desktop donor fixture, which the surface rendered as though it were
// the org's clients — invented names, cities, proposal counts and pipeline
// figures, on the live /dashboard/clients URL at ≤768px. The book is now read
// from the database by ./client-book.ts, using the desktop page's query.
//
// What stays here is everything that is NOT data: the row type, the page size,
// the three filter keys that are not literal tags, and the search / filter /
// count predicates the component runs over the loaded book.

export type Client = {
  id: string;
  name: string;
  email: string | null;
  /** "City, ST" — the desktop table's Location column, computed server-side. */
  address: string;
  proposalCount: number;
  pipelineValue: number;
  vip: boolean;
  /** The client's org tags, VIP excluded; they populate the tag filter. */
  tags: string[];
  /** Short plate, "Jul 22". Pre-formatted on the server — a Date formatted at
   *  render time is formatted twice, once per environment. */
  updated: string;
  // ---- raw database columns, carried so the edit sheet can round-trip a
  // record without wiping the fields the handheld form has no input for.
  // `updateClient` writes the whole address block, so a save that omitted the
  // street line or the zip would blank them.
  phone?: string | null;
  /** `Client.address` in the database — the street line, not the display string. */
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** `Client.notes` — the internal note the sheet edits. Carried for the same
   *  reason as the address block: the form fills from it, so a save cannot
   *  blank a note the card never knew about. */
  notes?: string | null;
};

/** The Location line as both editions build it: "City, ST" when they are on
 *  file, the street otherwise. Used to re-label a row from what a write
 *  returns, so the card reads the same before and after a reload. */
export function locationLabel(rec: {
  address: string | null;
  city: string | null;
  state: string | null;
}): string {
  return [rec.city, rec.state].filter(Boolean).join(", ") || rec.address || "";
}

/** The short plate a freshly written row wears until the next server read. */
export function todayPlate(): string {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}

/**
 * The desktop sheet pages 12 at a time. A handheld row is three lines tall, so
 * 8 — same reasoning that took the proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 8;

/** Filter keys that are not literal tags. There used to be a third, UNTAGGED;
 *  it was removed with its filter option — a key no option can select is a
 *  branch in `matchesTag` that nothing can reach. */
export const ALL = "ALL";
export const VIP = "VIP";

/**
 * Two letters, so eighteen rows are scannable: "M. Henderson" → MH,
 * "Cascade PM" → CP, a single word → its first two letters. Punctuation is
 * stripped first, which is what keeps the "M." initial from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, " ").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Distinct tags across the book, alphabetical — drives the filter options. */
export function allTags(list: Client[]): string[] {
  const seen: string[] = [];
  list.forEach((c) => c.tags.forEach((t) => {
    if (!seen.includes(t)) seen.push(t);
  }));
  return seen.sort();
}

export function matchesTag(c: Client, tag: string): boolean {
  if (tag === ALL) return true;
  if (tag === VIP) return c.vip;
  return c.tags.includes(tag);
}

/** Name, city, email and tags all answer the search box. */
export function matchesQuery(c: Client, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    c.name.toLowerCase().includes(q) ||
    c.address.toLowerCase().includes(q) ||
    (c.email ?? "").toLowerCase().includes(q) ||
    c.tags.join(" ").toLowerCase().includes(q)
  );
}

export function tagCount(list: Client[], tag: string): number {
  return list.filter((c) => matchesTag(c, tag)).length;
}
