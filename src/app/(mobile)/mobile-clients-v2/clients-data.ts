// Mobile clients (mobile-clients-v2) — demo fixture.
//
// Carried over verbatim from the desktop clients donor fixture
// (src/components/v3/clients-blueprint/clients-data.ts) so the handheld
// composition is judged against the same book as the desktop sheet.
// Seattle-area contractor texture: private clients and companies mixed,
// pipeline $0–$24,600, three VIP accounts, three untagged records, and one
// client with no email on file (T. Ortiz) — that last one is what makes the
// row sheet's disabled state reachable.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime by the
// row sheet (VIP toggle / delete) and the create form, so the component
// clones this seed per mount.

export type Client = {
  id: string;
  name: string;
  email: string | null;
  /** "City, ST" — the desktop table's Location column. */
  address: string;
  proposalCount: number;
  pipelineValue: number;
  vip: boolean;
  /** Free-form labels; they populate the tag filter. */
  tags: string[];
  updated: string;
};

export const CLIENTS_SEED: Client[] = [
  { id: "c01", name: "M. Henderson", email: "m.henderson@mail.com", address: "Bothell, WA", proposalCount: 3, pipelineValue: 24600, vip: true, tags: ["Roofing"], updated: "Jul 22" },
  { id: "c02", name: "Cascade PM", email: "ops@cascadepm.com", address: "Redmond, WA", proposalCount: 9, pipelineValue: 18700, vip: true, tags: ["Property mgmt", "Repeat"], updated: "Jul 22" },
  { id: "c03", name: "D. Reyes", email: "d.reyes@mail.com", address: "Kirkland, WA", proposalCount: 2, pipelineValue: 12400, vip: false, tags: ["Fencing", "Repeat"], updated: "Jul 21" },
  { id: "c04", name: "A. Kim", email: "a.kim@mail.com", address: "Bellevue, WA", proposalCount: 1, pipelineValue: 21500, vip: false, tags: ["Decking"], updated: "Jul 20" },
  { id: "c05", name: "Northgate LLC", email: "facilities@ngllc.com", address: "Everett, WA", proposalCount: 6, pipelineValue: 9600, vip: true, tags: ["Commercial", "Repeat"], updated: "Jul 19" },
  { id: "c06", name: "K. Marsh", email: "k.marsh@mail.com", address: "Woodinville, WA", proposalCount: 1, pipelineValue: 5400, vip: false, tags: ["Roofing"], updated: "Jul 19" },
  { id: "c07", name: "R. Okafor", email: "r.okafor@mail.com", address: "Redmond, WA", proposalCount: 1, pipelineValue: 3800, vip: false, tags: [], updated: "Jul 18" },
  { id: "c08", name: "T. Bishop", email: "t.bishop@mail.com", address: "Woodinville, WA", proposalCount: 2, pipelineValue: 7900, vip: false, tags: ["Roofing", "Repeat"], updated: "Jul 17" },
  { id: "c09", name: "S. Patel", email: "s.patel@mail.com", address: "Mill Creek, WA", proposalCount: 4, pipelineValue: 18700, vip: false, tags: ["Property mgmt"], updated: "Jul 16" },
  { id: "c10", name: "L. Wong", email: "l.wong@mail.com", address: "Sammamish, WA", proposalCount: 2, pipelineValue: 14800, vip: false, tags: ["Decking"], updated: "Jul 15" },
  { id: "c11", name: "J. Whitfield", email: "j.whitfield@mail.com", address: "Everett, WA", proposalCount: 1, pipelineValue: 9600, vip: false, tags: ["Roofing"], updated: "Jul 14" },
  { id: "c12", name: "P. Delgado", email: "p.delgado@mail.com", address: "Kenmore, WA", proposalCount: 1, pipelineValue: 0, vip: false, tags: ["Fencing"], updated: "Jul 12" },
  { id: "c13", name: "N. Ivanov", email: "n.ivanov@mail.com", address: "Lynnwood, WA", proposalCount: 1, pipelineValue: 6200, vip: false, tags: ["Fencing"], updated: "Jul 11" },
  { id: "c14", name: "C. Ferreira", email: "c.ferreira@mail.com", address: "Bothell, WA", proposalCount: 2, pipelineValue: 0, vip: false, tags: ["Roofing", "Repeat"], updated: "Jul 10" },
  { id: "c15", name: "K. Sorensen", email: "k.sorensen@mail.com", address: "Kirkland, WA", proposalCount: 1, pipelineValue: 0, vip: false, tags: ["Fencing"], updated: "Jul 08" },
  { id: "c16", name: "D. Pham", email: "d.pham@mail.com", address: "Redmond, WA", proposalCount: 1, pipelineValue: 0, vip: false, tags: [], updated: "Jun 30" },
  { id: "c17", name: "T. Ortiz", email: null, address: "Bothell, WA", proposalCount: 1, pipelineValue: 850, vip: false, tags: [], updated: "Jun 28" },
  { id: "c18", name: "R. Tran", email: "r.tran@mail.com", address: "Bothell, WA", proposalCount: 1, pipelineValue: 0, vip: false, tags: ["Decking"], updated: "Jun 24" },
];

/**
 * The desktop sheet pages 12 at a time. A handheld row is three lines tall, so
 * 8 — same reasoning that took the proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 8;

/** Filter keys that are not literal tags. */
export const ALL = "ALL";
export const VIP = "VIP";
export const UNTAGGED = "UNTAGGED";

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
  if (tag === UNTAGGED) return c.tags.length === 0;
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
