// Mobile workers (mobile-workers-v2) — the roster's shape and its pure helpers.
//
// NO FIXTURE LIVES HERE ANY MORE. The roster is the org's real crew, read by
// ./workers-roster.ts (the desktop page's own query) and written by the real
// worker server actions. What stays in this file is the row TYPE the two
// editions share and the pure functions the handheld surface filters, searches
// and counts with — everything that can be decided without a database.
//
// The type is still the desktop donor's field-for-field
// (src/components/v3/workers-blueprint/workers-data.ts), so both editions
// describe the same record.

export type WorkerRoleValue = "INSTALLER" | "SALES" | "ESTIMATOR" | "MANAGER";
export type InviteStatus = "PENDING" | "ACCEPTED" | "DECLINED";

export type WorkerRoleOption = { value: WorkerRoleValue; label: string };

export type WorkerJob = { id: string; title: string };

/** LedgerEntry: folio, name, email, phone, specialties, hourlyRate, token,
 *  inviteStatus (PENDING | ACCEPTED | DECLINED), role, joinedISO, activeJobs. */
export type WorkerEntry = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  specialties: string[];
  rate: number | null;
  token: string;
  invite: InviteStatus;
  role: string;
  joined: string;
  jobs: WorkerJob[];
};

export const WORKER_ROLES: WorkerRoleOption[] = [
  { value: "INSTALLER", label: "Installer" }, { value: "SALES", label: "Sales" },
  { value: "ESTIMATOR", label: "Estimator" }, { value: "MANAGER", label: "Manager" },
];

/**
 * The desktop roster shows the whole crew in one internally-scrolling card. A
 * handheld row is three lines tall, so the book pages instead — 6, the same
 * number the proposals ledger settled on for the same reason.
 */
export const PAGE_SIZE = 6;

/* ---- filter keys ---------------------------------------------------------
   The desktop's three stat tiles (all / on-job / available) are the first
   three. Invited and Declined are added because they are states this roster
   actually holds and they are what you look for on a phone — the same
   reasoning that put VIP and Untagged on mobile-clients-v2's filter. */
export const ALL = "ALL";
export const ON_JOB = "ON_JOB";
export const AVAILABLE = "AVAILABLE";
export const INVITED = "INVITED";
export const DECLINED = "DECLINED";

export const FILTERS: { key: string; label: string }[] = [
  { key: ALL, label: "All crew" },
  { key: ON_JOB, label: "On a job" },
  { key: AVAILABLE, label: "Available" },
  { key: INVITED, label: "Invited" },
  { key: DECLINED, label: "Declined" },
];

/**
 * Two letters, so a roster is scannable: "Marcus Bell" → MB, a single word →
 * its first two letters. The donor's own function, guard included: punctuation
 * is stripped first, which is what keeps an initial like "M." from becoming ".".
 */
export function monogram(name: string): string {
  const p = name.replace(/[^A-Za-z. ]/g, "").split(" ").filter(Boolean);
  if (p.length === 0) return "?";
  return p.length === 1 ? p[0].slice(0, 2).toUpperCase() : (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

export function roleLabel(r: string): string {
  const x = WORKER_ROLES.find((w) => w.value === r);
  return x ? x.label : r.charAt(0) + r.slice(1).toLowerCase();
}

/** Everything the masthead and the filter counts read. */
export function counts(list: WorkerEntry[]) {
  return {
    all: list.length,
    onJob: list.filter((e) => e.jobs.length > 0).length,
    available: list.filter((e) => e.invite === "ACCEPTED" && e.jobs.length === 0).length,
    invited: list.filter((e) => e.invite === "PENDING").length,
    declined: list.filter((e) => e.invite === "DECLINED").length,
    active: list.reduce((a, e) => a + e.jobs.length, 0),
  };
}

export function matchesFilter(e: WorkerEntry, key: string): boolean {
  if (key === ON_JOB) return e.jobs.length > 0;
  if (key === AVAILABLE) return e.invite === "ACCEPTED" && e.jobs.length === 0;
  if (key === INVITED) return e.invite === "PENDING";
  if (key === DECLINED) return e.invite === "DECLINED";
  return true;
}

/** Name and email are the desktop's search fields; phone, trade and role are
 *  added because on a phone they are how you actually find a crew member. */
export function matchesQuery(e: WorkerEntry, query: string): boolean {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    e.name.toLowerCase().includes(q) ||
    (e.email ?? "").toLowerCase().includes(q) ||
    (e.phone ?? "").toLowerCase().includes(q) ||
    e.specialties.join(" ").toLowerCase().includes(q) ||
    roleLabel(e.role).toLowerCase().includes(q)
  );
}

export function filterCount(list: WorkerEntry[], key: string): number {
  return list.filter((e) => matchesFilter(e, key)).length;
}

/** The shareable form of a worker's token portal — the one thing a manager
 *  actually hands over. The host is supplied by the caller so the string is
 *  identical on the server and the client. */
export function portalLink(host: string, token: string): string {
  return `${host}/w/${token}`;
}
