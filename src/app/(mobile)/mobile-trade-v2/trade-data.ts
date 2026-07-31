// Mobile trade board (mobile-trade-v2) — demo fixture.
//
// The POSTING half of the desktop donor fixture
// (src/components/v3/trade-blueprint/trade-data.ts), carried over VERBATIM:
// same values, same field names, same order, so the handheld composition is
// judged against exactly the same board as the desktop sheet. Two departures,
// neither one an edit to a donor value: the additive `budget` / `place` keys
// the detail sheet reads (see the type below), and the donor's influencer
// statements and payouts, which are gone — that audience now signs in at
// /influencer against real scoped queries, so a demo fixture for them here
// would be a second, lying source. Seattle-area contractor texture — Bothell,
// Kirkland, Everett — with two CLOSED threads (p5, p7) and exactly one thread
// authored by the signed-in contractor (p3, Ivan Petrov). Those two facts are
// what make the row sheet's disabled states reachable without inventing a
// field the donor does not have.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma, a server action or the network. The arrays are mutated at
// runtime by the row sheet (close / reopen / remove) and by the publish flow,
// so the component clones this seed per mount.
//
// Types are annotated widely (`string`, not string literals) exactly as the
// donor does, so `p.status === "CLOSED"` compiles instead of tripping TS2367
// on a narrowed literal type.

export type TradeCategory = {
  key: string;
  label: string;
  tone: string;
};

export type TradePost = {
  id: string;
  cat: string;
  status: string;
  title: string;
  author: string;
  when: string;
  replies: number;
  body: string;
  /* ---- handheld additions (detail sheet only) ------------------------
     The donor card shows a 3-line body excerpt and nothing else, so the
     two facts a contractor actually scans for — what it pays and where it
     is — were buried mid-paragraph. The detail sheet pulls them out as
     spec rows. Optional, because a question thread has no price and a post
     published from the form has neither: the sheet reads that absence as
     "Not stated" rather than inventing a value. */
  budget?: string;
  place?: string;
};

export const CATEGORIES: TradeCategory[] = [
  { key: 'all', label: 'All', tone: '' },
  { key: 'equipment', label: 'Equipment', tone: 'var(--blueprint)' },
  { key: 'subcontractor', label: 'Subcontractor', tone: 'var(--warning)' },
  { key: 'job-share', label: 'Job share', tone: 'var(--success)' },
  { key: 'question', label: 'Question', tone: 'var(--muted-faint)' }
];

/** Donor `postSeq` starts at 40; the counter itself is per-mount state. */
export const POST_SEQ_START: number = 40;

/* Every `budget` and `place` below is read straight out of the post's own
   body text — the donor buried them mid-paragraph; nothing new was invented.
   The two question threads carry a place but no budget on purpose: that is
   the "Not stated" branch of the detail sheet, reachable from the seed. */
export const POSTS_SEED: TradePost[] = [
  { id: 'p1', cat: 'equipment', status: 'OPEN', title: 'Selling a 2019 dump trailer', author: 'Marcus Bell', when: '2h ago', replies: 4,
    budget: '$8,900 firm', place: 'Bothell, WA',
    body: '14 ft, 14k GVWR, new brakes and lights last spring. Tarp kit included. Kept indoors. $8,900 firm, located in Bothell.' },
  { id: 'p2', cat: 'subcontractor', status: 'OPEN', title: 'Need a gutter crew for two days', author: 'Sofia Ramos', when: '5h ago', replies: 7,
    budget: 'Two days, day rate', place: 'Kirkland, WA',
    body: 'Two-story colonial in Kirkland, full perimeter plus guards. My crew is booked through the month — happy to hand the whole scope over or subcontract it.' },
  { id: 'p3', cat: 'job-share', status: 'OPEN', title: 'Overflow: three reroofs in Everett', author: 'Ivan Petrov', when: '1d ago', replies: 12,
    budget: 'Split materials, keep labor', place: 'Everett, WA',
    body: 'Took on more than we can schedule before the rain. Three straightforward asphalt tear-offs, homeowner already signed. Split on materials, you keep the labor.' },
  { id: 'p4', cat: 'question', status: 'OPEN', title: 'What are you charging for steep-pitch lately?', author: 'Dan Kowalski', when: '2d ago', replies: 9,
    place: 'East side',
    body: 'Anything 10/12 and up around the east side. We have been adding $28 a square and it feels light with the crew time it eats.' },
  { id: 'p5', cat: 'equipment', status: 'CLOSED', title: 'Compressor and two nail guns — sold', author: 'Grant Mueller', when: '4d ago', replies: 3,
    budget: 'Sold', place: 'Lynnwood, WA',
    body: 'Bostitch setup, ran fine, just upgraded. Gone to the first caller — thanks everyone.' },
  { id: 'p6', cat: 'subcontractor', status: 'OPEN', title: 'Fencing sub wanted, ongoing work', author: 'Amara Cole', when: '5d ago', replies: 2,
    budget: 'Per run, ongoing', place: 'Snohomish County',
    body: 'Property manager account with steady cedar and vinyl runs. Looking for someone reliable to take the overflow every month.' },
  { id: 'p7', cat: 'question', status: 'CLOSED', title: 'Who do you use for dumpster drops?', author: 'Marcus Bell', when: '1w ago', replies: 15,
    place: 'North of Seattle',
    body: 'Our usual hauler keeps slipping the drop window. Looking for someone dependable north of Seattle.' }
];

/* ------------------------------------------------------------------ */
/* Handheld additions. Nothing below changes a donor value — these are  */
/* the view keys and the client-side helpers the mobile cut needs.      */
/* ------------------------------------------------------------------ */

/**
 * The signed-in contractor. The donor's publish flow stamps new posts with
 * this exact author string, which is also what makes "Close thread" an
 * author-only action with one reachable record (p3) in the seed.
 */
export const ME: string = 'Ivan Petrov';

/**
 * The desktop renders every post at once in a 330px auto-fill grid. A handheld
 * row is three lines tall, so the board pages — same reasoning that took the
 * proposals ledger from 8 to 6 and the clients book from 12 to 8.
 */
export const PAGE_SIZE = 6;

/** The "no category" filter key — the donor's own `cat` state default. */
export const ALL = "all";

/**
 * Two letters, so the board is scannable: "Marcus Bell" → MB, "Dan Kowalski"
 * → DK, a single word → its first two letters. The donor's function, verbatim.
 */
export function initials(n: string): string {
  const p = n.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Donor `catLabel`: the badge text, lower-cased; the badge caps it in CSS. */
export function catLabel(k: string): string {
  const c = CATEGORIES.find((x) => x.key === k);
  return c ? c.label.toLowerCase() : k.replace("-", " ");
}

export function matchesCat(p: TradePost, key: string): boolean {
  return key === ALL || p.cat === key;
}

/** Title, body, author and category all answer the search box. */
export function matchesQuery(p: TradePost, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    p.title.toLowerCase().includes(q) ||
    p.body.toLowerCase().includes(q) ||
    p.author.toLowerCase().includes(q) ||
    catLabel(p.cat).includes(q)
  );
}

export function catCount(list: TradePost[], key: string): number {
  return list.filter((p) => matchesCat(p, key)).length;
}
