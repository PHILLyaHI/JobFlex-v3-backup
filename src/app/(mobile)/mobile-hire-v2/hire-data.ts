// Mobile hire (mobile-hire-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop hire donor fixture
// (src/components/v3/hire-blueprint/hire-data.ts) so the handheld composition is
// judged against the same candidates, doors, tallies and links as the desktop
// sheet. Every id, name, email, phone, role, source and relative timestamp is
// the donor's exact value; only the mobile-only helpers at the bottom are new.
//
// Seattle-area contractor texture: seven candidates across four pipeline
// stages, two of them with NO phone on file (Owen Fletcher, Bruno Salas) — that
// pair is what makes the row sheet's disabled "Call" state reachable, and the
// single REJECTED record (Bruno Salas) is what makes the disabled "Reject" state
// reachable. One HIRED record (Hana Whitmore) is what makes "Convert to worker"
// reachable.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime by the row
// sheet (stage moves / delete) and the candidate form, so the component clones
// this seed per mount and nothing leaks between mounts.

export type HireColumnKey = "APPLIED" | "INTERVIEWING" | "HIRED" | "REJECTED";

export type HireColumn = {
  key: HireColumnKey;
  label: string;
  /** The donor's tone, carried verbatim. The handheld stage badges need the
   *  full 3-tone treatment (base border / soft fill / base text), which a single
   *  colour string cannot express, so they are CSS classes keyed off the stage
   *  instead — see .hstageApplied … in mobile-hire.module.css. */
  tone: string;
};

export type Applicant = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: HireColumnKey;
  source: string | null;
  age: string;
  notes: string;
};

export type HubDoor = {
  icon: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
};

export type HubTally = {
  label: string;
  value: string;
  hint: string;
};

export type HubLink = {
  icon: string;
  label: string;
  sub: string;
  goto?: string;
  soon?: boolean;
};

// Applicant: fullName, email, phone, role, status, source, notes, createdAt.
export const HK_COLUMNS: HireColumn[] = [
  { key: "APPLIED", label: "Applied", tone: "var(--blueprint)" },
  { key: "INTERVIEWING", label: "Interviewing", tone: "var(--warning)" },
  { key: "HIRED", label: "Hired", tone: "var(--success)" },
  { key: "REJECTED", label: "Rejected", tone: "var(--danger)" },
];

export const SOURCES: string[] = ["Indeed", "Referral", "Walk-in", "LinkedIn", "Job fair", "Other"];

export const AP_SEQ_START = 20;

export const APPLICANTS_SEED: Applicant[] = [
  { id: 'a1', name: 'Casey Stone',    email: 'casey.stone@mail.com',  phone: '(425) 555-0210', role: 'Roofer',            status: 'APPLIED',      source: 'Indeed',   age: '2h ago', notes: '6 years on asphalt and metal. Has own truck and basic hand tools.' },
  { id: 'a2', name: 'Priya Raman',    email: 'p.raman@mail.com',      phone: '(425) 555-0211', role: 'Estimator',         status: 'APPLIED',      source: 'LinkedIn', age: '1d ago', notes: 'Came from a fencing shop; comfortable with takeoffs and client calls.' },
  { id: 'a3', name: 'Owen Fletcher',  email: 'owen.f@mail.com',       phone: null,             role: 'Laborer',           status: 'APPLIED',      source: 'Walk-in',  age: '3d ago', notes: 'No experience, eager. Available immediately.' },
  { id: 'a4', name: 'Marisol Vega',   email: 'm.vega@mail.com',       phone: '(425) 555-0212', role: 'Foreman',           status: 'INTERVIEWING', source: 'Referral', age: '5d ago', notes: 'Referred by Marcus. Ran three-man crews for eight years.' },
  { id: 'a5', name: 'Derek Olsen',    email: 'derek.olsen@mail.com',  phone: '(425) 555-0213', role: 'Gutter installer',  status: 'INTERVIEWING', source: 'Indeed',   age: '1w ago', notes: 'Phone screen done — wants $34/hr, ok with early starts.' },
  { id: 'a6', name: 'Hana Whitmore',  email: 'hana.w@mail.com',       phone: '(425) 555-0214', role: 'Siding installer',  status: 'HIRED',        source: 'Job fair', age: '2w ago', notes: 'Starts Monday. Paperwork signed, portal invite pending.' },
  { id: 'a7', name: 'Bruno Salas',    email: 'bruno.salas@mail.com',  phone: null,             role: 'Deck carpenter',    status: 'REJECTED',     source: 'Other',    age: '3w ago', notes: 'Wanted subcontract work only; not a fit for crew slots right now.' },
];

export const HUB_DOORS: HubDoor[] = [
  { icon: 'i-search', kicker: 'For hirers', title: 'Discover talent',
    body: 'Browse worker profiles, view portfolios, and find the right contractor for your next project.',
    cta: 'Browse the marketplace' },
  { icon: 'i-userplus', kicker: 'For workers', title: 'Publish your profile',
    body: 'Showcase your skills and past work, then get discovered by companies looking to hire.',
    cta: 'Manage your profile' },
];

export const HUB_TALLY: HubTally[] = [
  { label: 'Active contracts', value: '0', hint: 'None in progress' },
  { label: 'Job posts', value: '0', hint: 'None live' },
  { label: 'Applications', value: '0', hint: 'None sent' },
];

export const HUB_LINKS: HubLink[] = [
  { icon: 'i-users',   label: 'Applicant pipeline', sub: 'Track candidates through your hiring funnel', goto: 'pipeline' },
  { icon: 'i-jobs',    label: 'Job posts',          sub: 'Manage your job listings', soon: true },
  { icon: 'i-file',    label: 'Contracts',          sub: 'View active agreements', soon: true },
  { icon: 'i-send',    label: 'Applications',       sub: "Track what you've applied to", soon: true },
];

/* ============================================================
   MOBILE-ONLY ADDITIONS — nothing above this line differs from
   the desktop fixture.
   ============================================================ */

/**
 * The desktop board pages nothing at all: all four kanban columns render every
 * card and the board just grows. A handheld row is three lines tall, so the flat
 * candidate list pages — 6, the same figure the proposals ledger settled on.
 */
export const PAGE_SIZE = 6;

/** The stage filter's "everything" key. Not a stage, so not in HK_COLUMNS. */
export const ALL = "ALL";

/** Stage keys plus ALL — what the one filter dropdown offers. */
export type StageKey = HireColumnKey | typeof ALL;

/**
 * Two letters, so a screenful of candidates is scannable: "Casey Stone" → CS,
 * a single word → its first two letters. The donor's algorithm verbatim, plus a
 * guard for a name that strips to nothing (the create form takes free text).
 */
export function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (!p.length) return "?";
  return p.length === 1
    ? p[0].slice(0, 2).toUpperCase()
    : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function stageLabel(key: string): string {
  if (key === ALL) return "All candidates";
  return HK_COLUMNS.find((c) => c.key === key)?.label ?? key;
}

export function matchesStage(a: Applicant, stage: string): boolean {
  return stage === ALL || a.status === stage;
}

/** Name, role, source, email and phone all answer the search box. */
export function matchesQuery(a: Applicant, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    a.name.toLowerCase().includes(q) ||
    a.role.toLowerCase().includes(q) ||
    (a.source ?? "").toLowerCase().includes(q) ||
    (a.email ?? "").toLowerCase().includes(q) ||
    (a.phone ?? "").toLowerCase().includes(q)
  );
}

export function stageCount(list: Applicant[], stage: string): number {
  return list.filter((a) => matchesStage(a, stage)).length;
}
