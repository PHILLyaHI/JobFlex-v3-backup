// Mobile hire (mobile-hire-v2) — shared shapes + pure helpers.
//
// The demo fixture is gone: the page is fed the org's real pipeline by
// getHireSeed (src/actions/applicants.ts) and the marketplace blocks by the
// trade-network actions (src/actions/tradeServices.ts) — the same substrate
// the desktop /dashboard/hire reads. Only the shapes and the mobile-only
// helpers live here.

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
  resumeUrl?: string | null;
};

export type HubDoor = {
  icon: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
  /** Which bottom sheet the door opens. */
  sheet: "talent" | "profile";
};

export type HubLink = {
  icon: string;
  label: string;
  sub: string;
  /** Switch to the pipeline tab… */
  goto?: string;
  /** …or leave for another route. */
  href?: string;
};

/** The "Your activity" numbers, computed server-side in page.tsx — the same
 *  definition the desktop hub uses (see hire-blueprint/hire-data.ts). */
export type HireTallies = {
  hired: number;
  openPosts: number;
  totalPosts: number;
  interestReceived: number;
  interestSent: number;
};

// Applicant: fullName, email, phone, role, status, source, notes, createdAt.
export const HK_COLUMNS: HireColumn[] = [
  { key: "APPLIED", label: "Applied", tone: "var(--blueprint)" },
  { key: "INTERVIEWING", label: "Interviewing", tone: "var(--warning)" },
  { key: "HIRED", label: "Hired", tone: "var(--success)" },
  { key: "REJECTED", label: "Rejected", tone: "var(--danger)" },
];

export const SOURCES: string[] = ["Indeed", "Referral", "Walk-in", "LinkedIn", "Job fair", "Other"];

export const HUB_DOORS: HubDoor[] = [
  { icon: 'i-search', kicker: 'For hirers', title: 'Discover talent',
    body: 'See which companies in the trade network are open for work — their trades, specialties and service area.',
    cta: 'Open the directory', sheet: 'talent' },
  { icon: 'i-userplus', kicker: 'For workers', title: 'Publish your profile',
    body: 'List your trades and service area as open for work, so matching trade jobs land in your inbox.',
    cta: 'Manage your profile', sheet: 'profile' },
];

export const HUB_LINKS: HubLink[] = [
  { icon: 'i-users', label: 'Applicant pipeline', sub: 'Track candidates through your hiring funnel', goto: 'pipeline' },
  { icon: 'i-jobs',  label: 'Job posts',          sub: 'The work you broadcast to the trade network', href: '/trade-services' },
  { icon: 'i-send',  label: 'Applications',       sub: 'Interest on your posts, and jobs you raised a hand for', href: '/trade-services' },
];

/* ============================================================
   MOBILE-ONLY HELPERS
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
