// Clients blueprint — the row shapes and the page size.
//
// THIS FILE HOLDS NO RECORDS. It used to carry the donor demo book (eighteen
// invented clients, verbatim from jobflex-clients-blueprint_2.html), which
// clients-behavior.ts fell back to whenever it was mounted without an
// `entries` prop. The page has read the real book from the database since it
// went live, so the seed was an unreachable fixture that only survived as a
// trap for the first caller who forgot the prop — `entries` is now required
// and the seed is gone.
//
// Fields mirror the classic list's ClientRow shape: id, name, email, address
// (city, state), proposalCount, pipelineValue, tags [{label,color}], vip,
// updated.

export type ClientTag = {
  label: string;
  color?: string;
};

export type Client = {
  id: string;
  name: string;
  email: string | null;
  /** DISPLAY string for the Location column — "Kirkland, WA", the same
   *  `[city, state] || address` the classic list showed. */
  address: string;
  proposalCount: number;
  pipelineValue: number;
  vip: boolean;
  tags: ClientTag[];
  updated: string;
  // ---- raw database columns, carried so the edit dialog can round-trip a
  // record without wiping the fields the blueprint form has no input for.
  // `updateClient` writes the whole address block, so a save that omitted
  // line 1 / zip / phone would blank them.
  phone?: string | null;
  /** `Client.address` in the database — street line, not the display string. */
  line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** `Client.notes` — the internal note the dialog edits. Carried for the same
   *  reason as the address block: the form fills from it, so a save cannot
   *  blank a note the row never knew about. */
  notes?: string | null;
};

/** Donor: `const PAGE_SIZE = 12;` (the original page used usePagedList(rows, 20)). */
export const PAGE_SIZE = 12;
