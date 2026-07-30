// Mobile leads (mobile-leads-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop leads donor fixture
// (src/components/v3/leads-blueprint/leads-data.ts) so the handheld composition
// is judged against the same pipeline as the desktop sheet: every field name,
// string, number and null is unchanged. Seattle-area contractor texture —
// Bothell / Everett / Woodinville / Redmond / Kirkland / Sammamish / Kenmore /
// Bellevue / Mill Creek, roofing + fencing + decking + gutters + siding.
//
// States the fixture makes reachable, on purpose:
//  · T. Ortiz (613) has email: null      → the row sheet's DISABLED "Send email"
//  · four leads are already Ivan's       → the DISABLED "Assign to me" row
//  · three leads have assignee: null     → the em-dash absence on the row card
//  · 2 WON + 1 LOST                      → a real win rate in the masthead
//  · ARCHIVED is in the status list but held by nobody → the "No matches" empty
//    state is one tap away
//  · offer o1 has email: null, o2 has phone: null → the contact line falls back
//  · imported / pasted leads land with spec: null, conf: 0 → the dashed
//    "Unsorted" trade badge
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The arrays are mutated at runtime (accept /
// decline / move / delete / import), so the component clones both seeds per
// mount and a remount starts from the donor's state.

export type Lead = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  city: string;
  project: string;
  spec: string | null;
  conf: number;
  status: string;
  source: string;
  assignee: string | null;
  age: string;
  desc: string;
};

export type Offer = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string;
  project: string;
  spec: string;
  conf: number;
  attempt: number;
  mins: number;
  age: string;
  desc: string;
};

export type StagedRow = {
  name: string;
  email: string | null;
  phone: string | null;
  project: string | null;
  source: string;
};

/** All seven pipeline stages — the destinations offered by the move sheet. */
export const STAGES: Array<{ key: string; label: string }> = [
  { key: 'NEW', label: 'New' }, { key: 'ROUTED', label: 'Routed' },
  { key: 'CLAIMED', label: 'Claimed' }, { key: 'CONTACTED', label: 'Contacted' },
  { key: 'QUOTED', label: 'Quoted' }, { key: 'WON', label: 'Won' }, { key: 'LOST', label: 'Lost' }
];

/**
 * The five stages the Pipeline tab draws as sections. Won and Lost are
 * OUTCOMES, not work: on a phone the board is a queue of leads you still owe
 * something, so the two terminal stages stay off it. Nothing is hidden — they
 * are still destinations in the move sheet, still rows in All leads behind the
 * status filter, and their totals are drawn on the board's own foot.
 */
export const WORKING_STAGES = STAGES.filter((s) => s.key !== 'WON' && s.key !== 'LOST');

export const LEAD_STATUSES = ['ALL', 'NEW', 'ROUTED', 'CLAIMED', 'CONTACTED', 'QUOTED', 'WON', 'LOST', 'ARCHIVED'];

export const SRC: Record<string, string> = { MANUAL: 'Manual entry', EMAIL: 'Email paste', FACEBOOK: 'Facebook', IMPORT: 'Imported', FORM: 'Homeowner form', LEAD_CENTER: 'Lead center' };

/** Donor: `let seq = 700` — the id counter for imported/accepted rows. */
export const SEQ_START = 700;

export const LEADS_SEED: Lead[] = [
  { id: 601, name: 'M. Alvarez',   email: 'm.alvarez@mail.com',   phone: '(425) 555-0111', city: 'Bothell, WA',     project: 'Asphalt reroof',         spec: 'Roofing', conf: 0.94, status: 'NEW',       source: 'FORM',        assignee: null,     age: '2h ago', desc: 'Two layers of shingles, curling on the south slope. Wants a quote this week.' },
  { id: 602, name: 'J. Whitfield', email: 'j.whitfield@mail.com', phone: '(425) 555-0112', city: 'Everett, WA',     project: 'Metal roof repair',      spec: 'Roofing', conf: 0.88, status: 'ROUTED',    source: 'LEAD_CENTER', assignee: 'Marcus', age: '3h ago', desc: 'Leak above the garage after the last storm. Metal panels, single story.' },
  { id: 603, name: 'T. Bishop',    email: 't.bishop@mail.com',    phone: '(425) 555-0113', city: 'Woodinville, WA', project: 'Skylight install',       spec: 'Roofing', conf: 0.79, status: 'CLAIMED',   source: 'FORM',        assignee: 'Ivan',   age: '6h ago', desc: 'Two fixed skylights over the kitchen.' },
  { id: 604, name: 'R. Okafor',    email: 'r.okafor@mail.com',    phone: '(425) 555-0114', city: 'Redmond, WA',     project: 'Gutter replacement',     spec: 'Gutters', conf: 0.91, status: 'CONTACTED', source: 'FACEBOOK',    assignee: 'Marcus', age: '1d ago', desc: 'Full perimeter, wants guards included.' },
  { id: 605, name: 'M. Henderson', email: 'm.henderson@mail.com', phone: '(425) 555-0132', city: 'Bothell, WA',     project: 'Asphalt reroof',         spec: 'Roofing', conf: 0.96, status: 'QUOTED',    source: 'FORM',        assignee: 'Ivan',   age: '2d ago', desc: 'Estimate sent, waiting on the decision.' },
  { id: 606, name: 'D. Reyes',     email: 'd.reyes@mail.com',     phone: '(425) 555-0148', city: 'Kirkland, WA',    project: 'Cedar fence, 140 ft',    spec: 'Fencing', conf: 0.93, status: 'WON',       source: 'MANUAL',      assignee: 'Ivan',   age: '4d ago', desc: 'Signed; deposit received.' },
  { id: 607, name: 'S. Rao',       email: 's.rao@mail.com',       phone: '(425) 555-0116', city: 'Sammamish, WA',   project: 'Vinyl fence, 160 ft',    spec: 'Fencing', conf: 0.85, status: 'NEW',       source: 'FACEBOOK',    assignee: null,     age: '5h ago', desc: 'Corner lot, wants privacy panels along the street side.' },
  { id: 608, name: 'K. Sorensen',  email: 'k.sorensen@mail.com',  phone: '(425) 555-0117', city: 'Kirkland, WA',    project: 'Cedar fence, 90 ft',     spec: 'Fencing', conf: 0.9,  status: 'WON',       source: 'FORM',        assignee: 'Sofia',  age: '1w ago', desc: 'Completed and paid.' },
  { id: 609, name: 'L. Wong',      email: 'l.wong@mail.com',      phone: '(425) 555-0118', city: 'Sammamish, WA',   project: 'Pergola build',          spec: 'Decking', conf: 0.72, status: 'CONTACTED', source: 'IMPORT',      assignee: 'Sofia',  age: '6d ago', desc: 'Cedar posts, 12x14 footprint.' },
  { id: 610, name: 'P. Delgado',   email: 'p.delgado@mail.com',   phone: '(425) 555-0119', city: 'Kenmore, WA',     project: 'Vinyl fence, 220 ft',    spec: 'Fencing', conf: 0.81, status: 'LOST',      source: 'EMAIL',       assignee: 'Marcus', age: '2w ago', desc: 'Went with another shop on price.' },
  { id: 611, name: 'A. Kim',       email: 'a.kim@mail.com',       phone: '(425) 555-0177', city: 'Bellevue, WA',    project: 'Composite deck rebuild', spec: 'Decking', conf: 0.95, status: 'QUOTED',    source: 'FORM',        assignee: 'Ivan',   age: '3d ago', desc: 'Estimate accepted, scheduling next.' },
  { id: 612, name: 'S. Patel',     email: 's.patel@mail.com',     phone: '(425) 555-0120', city: 'Mill Creek, WA',  project: 'Siding replacement',     spec: 'Siding',  conf: 0.87, status: 'CLAIMED',   source: 'MANUAL',      assignee: 'Marcus', age: '1w ago', desc: 'Four-plex, property manager contact.' },
  { id: 613, name: 'T. Ortiz',     email: null,                   phone: '(425) 555-0122', city: 'Bothell, WA',     project: 'Roof inspection',        spec: 'Roofing', conf: 0.68, status: 'ROUTED',    source: 'LEAD_CENTER', assignee: null,     age: '9h ago', desc: 'Phone-in inquiry, no email on file.' }
];

// Lead Center offers: a 24-hour window, counted down in hours/minutes.
export const OFFERS_SEED: Offer[] = [
  { id: 'o1', name: 'B. Cole',     email: null, phone: '(425) 555-0201', city: 'Bothell, WA', project: 'Fence gate + repair', spec: 'Fencing', conf: 0.89, attempt: 1, mins: 22 * 60 + 14, age: '1h ago', desc: 'Gate sags and drags; 40 ft of adjoining fence needs repair.' },
  { id: 'o2', name: 'H. Nakamura', email: 'h.nakamura@mail.com', phone: null, city: 'Redmond, WA', project: 'Deck resurfacing', spec: 'Decking', conf: 0.76, attempt: 2, mins: 3 * 60 + 41, age: '4h ago', desc: 'Frame is solid, boards need replacing. About 320 sq ft.' }
];

/**
 * The desktop sheet pages 20 at a time. A handheld row is three lines tall, so
 * 8 — the same reasoning that took the clients book from 12 to 8 and the
 * proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 8;

/** The signed-in shop owner, per the shell's account block. */
export const ME = 'Ivan';

export type TabKey = 'all' | 'pipeline' | 'incoming';

export const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'all', label: 'All leads' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'incoming', label: 'Incoming' }
];

export type MethodKey = 'manual' | 'email' | 'file';

export const METHODS: Array<{ key: MethodKey; label: string; icon: string }> = [
  { key: 'manual', label: 'By hand', icon: 'i-userplus' },
  { key: 'email', label: 'Paste', icon: 'i-msg' },
  { key: 'file', label: 'CSV', icon: 'i-file' }
];

/** The three demo rows the desktop dropzone stages on tap, verbatim. */
export const CSV_DEMO: Array<[string, string, string]> = [
  ['N. Ivanov', 'n.ivanov@mail.com', 'Chain-link fence, 90 ft'],
  ['C. Ferreira', 'c.ferreira@mail.com', 'Chain-link gate'],
  ['D. Pham', 'd.pham@mail.com', 'Gutter guards']
];

export function srcLabel(v: string | null): string {
  return v ? SRC[v] || v : 'Direct';
}

/** ROUTED -> "Routed", ALL -> "All statuses". Status keys are SCREAMING_CASE. */
export function statusLabel(st: string): string {
  if (st === 'ALL') return 'All statuses';
  return st.charAt(0) + st.slice(1).toLowerCase();
}

export function pct(c: number): string {
  return Math.round(c * 100) + '%';
}

/** Offer window, counted down: "22h 14m left" / "41m left". */
export function clock(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? h + 'h ' + m + 'm left' : m + 'm left';
}

/**
 * Two letters, so a screenful of rows is scannable: "M. Alvarez" → MA,
 * "Cascade PM" → CP, a single word → its first two letters. Punctuation is
 * stripped first, which is what keeps the "M." initial from becoming ".".
 */
export function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** The Incoming tab: leads routed to the shop, plus anything brand new. */
export function isIncoming(l: Lead): boolean {
  return l.status === 'NEW' || l.status === 'ROUTED';
}

/** Still moving — everything the Pipeline board draws. */
export function isInPlay(l: Lead): boolean {
  return l.status !== 'WON' && l.status !== 'LOST' && l.status !== 'ARCHIVED';
}

/**
 * The search box answers for the two filter dimensions the phone cannot afford
 * as their own controls: type "Facebook" or "Roofing" and the source / trade
 * chip rows of the desktop popover are covered. City is in the haystack too,
 * because the row card shows it.
 */
export function matchesQuery(l: Lead, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    [
      l.name,
      l.email ?? '',
      l.phone ?? '',
      l.city,
      l.project,
      l.spec ?? '',
      l.assignee ?? '',
      srcLabel(l.source),
      l.desc,
    ]
      .join(' ')
      .toLowerCase()
      .indexOf(q) !== -1
  );
}
