// Mobile workers (mobile-workers-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop workers donor fixture
// (src/components/v3/workers-blueprint/workers-data.ts): same field names, same
// values, same seven records, so the handheld composition is judged against the
// same roster as the desktop sheet. Seattle-area contractor texture — a small
// roofing/fencing shop's crew.
//
// Every state the UI can render is reachable in this seed:
//  · ACCEPTED with live work (Marcus 3, Dan 2, Ivan 1) → the "On a job" filter
//  · ACCEPTED with nothing open (Sofia)                → the "Available" filter
//  · PENDING invites (Tyler, Amara)                    → the "Invited" filter
//  · a DECLINED invite (Grant)                         → the "Declined" filter
//  · no email on file (Amara)  → the sheet's Email row renders DISABLED
//  · no phone on file (Grant)  → the sheet's Call row renders DISABLED
//  · no hourly rate set (Ivan, Amara) → the row's money figure is an em dash
//  · no specialties set (Amara) → the record sheet's "none set" field state
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime by the
// invite / edit / remove flows, so the component clones this seed per mount and
// runtime edits never leak between mounts.

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

/** Donor: `let wkSeq = 10;` — new ids continue from w11. */
export const WK_SEQ_START = 10;

export const WORKERS_SEED: WorkerEntry[] = [
  { id: 'w1', name: 'Marcus Bell',   email: 'marcus@bellroofing.com', phone: '(425) 555-0141', specialties: ['Roofing', 'Fencing'], rate: 42, token: 'wk_8f2a41', invite: 'ACCEPTED', role: 'INSTALLER', joined: 'Mar 2024',
    jobs: [{ id: 'j1', title: 'Roof tear-off — 4812 Maple Ave' }, { id: 'j4', title: 'Asphalt reroof — Henderson' }, { id: 'j5', title: 'Cedar fence — 902 Alder Ct' }] },
  { id: 'w2', name: 'Sofia Ramos',   email: 'sofia@bellroofing.com',  phone: '(425) 555-0152', specialties: ['Estimating', 'Decking'], rate: 38, token: 'wk_1c77b0', invite: 'ACCEPTED', role: 'ESTIMATOR', joined: 'Jun 2024',
    jobs: [] },
  { id: 'w3', name: 'Dan Kowalski',  email: 'dan.k@bellroofing.com',  phone: '(425) 555-0163', specialties: ['Gutters', 'Roofing'], rate: 36, token: 'wk_59de23', invite: 'ACCEPTED', role: 'INSTALLER', joined: 'Sep 2024',
    jobs: [{ id: 'j2', title: 'Dumpster swap — Maple Ave' }, { id: 'j6', title: 'Skylight install — 210 Fir St' }] },
  { id: 'w4', name: 'Ivan Petrov',   email: 'ivan@bellroofing.com',   phone: '(425) 555-0100', specialties: ['Roofing', 'Siding', 'Decking'], rate: null, token: 'wk_0a3f77', invite: 'ACCEPTED', role: 'MANAGER', joined: 'Jan 2023',
    jobs: [{ id: 'j4', title: 'Asphalt reroof — Henderson' }] },
  { id: 'w5', name: 'Tyler Brooks',  email: 'tyler.brooks@mail.com',  phone: '(425) 555-0188', specialties: ['Fencing'], rate: 34, token: 'wk_b41e09', invite: 'PENDING', role: 'INSTALLER', joined: 'Jul 2026', jobs: [] },
  { id: 'w6', name: 'Amara Cole',    email: null,                     phone: '(425) 555-0195', specialties: [], rate: null, token: 'wk_77c2ab', invite: 'PENDING', role: 'SALES', joined: 'Jul 2026', jobs: [] },
  { id: 'w7', name: 'Grant Mueller', email: 'grant.m@mail.com',       phone: null,             specialties: ['Siding'], rate: 30, token: 'wk_e6d105', invite: 'DECLINED', role: 'INSTALLER', joined: 'May 2026', jobs: [] },
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

/** Per-mount clone: invite / edit / remove mutate the roster in place. */
export function cloneWorkers(seed: WorkerEntry[]): WorkerEntry[] {
  return seed.map((e) => ({
    ...e,
    specialties: e.specialties.slice(),
    jobs: e.jobs.map((j) => ({ ...j })),
  }));
}

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
