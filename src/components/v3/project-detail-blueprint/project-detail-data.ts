// PROJECT DETAIL / BLUEPRINT — shapes and the donor's pure helpers.
//
// The donor (`jobflex-projectdetail-blueprint (14).html`) ships a fixture:
// six jobs on `[year, monthIndex, day]` tuples inside a hardcoded
// Jun 15 → Sep 30 2026 window. This page reads the REAL project instead, so
// the fixture is gone and only the donor's derivations survive — its status
// vocabulary, its month names, its short-date shape and its bucket rules.
// Every literal string below ("Done", "In progress", "Scheduled", the month
// tables) is the donor's own.

/** The donor's three job states. `st` in the fixture. */
export type PdBucket = "done" | "prog" | "sch";

/** Donor: `const ST_LBL = { done: 'Done', prog: 'In progress', sch: 'Scheduled' }`. */
export const ST_LBL: Record<PdBucket, string> = {
  done: "Done",
  prog: "In progress",
  sch: "Scheduled",
};

/** Donor: `const MO = [...]` — the gantt axis and the short date. */
export const MO = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Donor: `const MOFULL = [...]` — the agenda's month rules and its chips. */
export const MOFULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface PdProject {
  id: string;
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  budget: number;
}

export interface PdJob {
  id: string;
  title: string;
  /** Raw Prisma Job.status: SCHEDULED | IN_PROGRESS | COMPLETED | CANCELED. */
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  clientName: string | null;
}

export interface PdAvailJob {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  clientName: string | null;
}

/* ══════════════════════════════════════════════════════════════════════════
   ATTACHING A PROPOSAL — what the schema actually allows (2026-08-15)

   The attach control on this page attaches PROPOSALS, not jobs. There is no
   `Proposal.projectId` column and no server action that writes one: the
   proposal builder's Basics block carries a project picker, but it is local
   state and says so in its own source ("Project selection is local-only — the
   Proposal model has no projectId column yet"). Prisma changes are out of
   scope, so the link cannot be direct.

   What DOES exist is the chain the data model already draws:

       Proposal ──< Job.proposalId          Job.projectId >── Project

   So a proposal is "on" a project when its JOBS are, and attaching one is
   `attachJob(projectId, jobId)` — the existing action, unchanged — run over
   the jobs that proposal owns. That is the whole of the write.

   The consequence is honest and has to be shown rather than hidden: a proposal
   with no job yet has nothing to link, and one whose jobs already sit on some
   other project is spoken for. Both still appear in the list — the reader asked
   "which of my proposals can go on this project", and an answer that silently
   drops two thirds of the book is not an answer — but they arrive carrying
   `blocked`, and the row says why instead of offering a button that would lie.
   ══════════════════════════════════════════════════════════════════════════ */
export interface PdAvailProposal {
  id: string;
  title: string;
  /** Raw Prisma Proposal.status: DRAFT | SENT | VIEWED | ACCEPTED | … */
  status: string;
  total: number;
  clientName: string | null;
  /** The proposal's jobs that sit on no project — exactly what attaching moves.
   *  Empty means the row cannot be attached, and `blocked` says why. */
  linkJobIds: string[];
  /** Why this proposal cannot be attached, or null when it can. */
  blocked: string | null;
}

/** Attachable rows first, each group keeping the server's own order (most
 *  recently touched first). A list that opens on six rows you cannot use reads
 *  as an empty list. */
export function attachableFirst(list: PdAvailProposal[]): PdAvailProposal[] {
  return [...list].sort((a, b) => Number(Boolean(a.blocked)) - Number(Boolean(b.blocked)));
}

/** The row's mono annotation: who it is for, what it is worth, and what
 *  attaching would actually move. */
export function proposalMeta(p: PdAvailProposal, money: (n: number) => string): string {
  const jobs = p.linkJobIds.length;
  const bits = [
    p.clientName ?? "No client",
    money(p.total),
    p.blocked ?? (jobs === 1 ? "1 job" : `${jobs} jobs`),
  ];
  return bits.join(" · ");
}

/**
 * Prisma's four job states onto the donor's three.
 *
 * CANCELED HAS NO DONOR EQUIVALENT — the fixture never contains one, so the
 * donor draws no fifth badge, no fifth filter chip and no fifth colour. Rather
 * than invent one, a canceled job returns `null`: it renders with the donor's
 * NEUTRAL badge (`pd-b--sch`, grey outline, no fill) carrying its own label,
 * and it is counted only by the "All" chip. Nothing new is drawn.
 */
export function bucketOf(status: string): PdBucket | null {
  switch (status) {
    case "COMPLETED":
      return "done";
    case "IN_PROGRESS":
      return "prog";
    case "SCHEDULED":
      return "sch";
    default:
      return null;
  }
}

/** Badge text. The donor's three labels, plus a title-cased fallback for the
 *  states it never drew (CANCELED, and anything a future migration adds). */
export function labelOf(status: string): string {
  const b = bucketOf(status);
  if (b) return ST_LBL[b];
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

/** The donor's badge / bar modifier. A bucketless state borrows the neutral one. */
export function badgeMod(status: string): PdBucket {
  return bucketOf(status) ?? "sch";
}

/**
 * Donor: `function shortDate(a) { return MO[a[1]] + ' ' + a[2]; }` — "Jun 15",
 * month abbreviation and an UNPADDED day. Read in local time, which is what
 * the page this replaces did (`shortDate` in @/lib/format), so the rendered
 * day never shifts against the rest of the app.
 */
export function shortDate(d: Date): string {
  return MO[d.getMonth()] + " " + d.getDate();
}

/** Midnight-anchored month key, so the agenda can group across a year boundary
 *  — the donor's fixture is single-year and groups on the month index alone. */
export function monthKey(d: Date): string {
  return d.getFullYear() + "-" + d.getMonth();
}
