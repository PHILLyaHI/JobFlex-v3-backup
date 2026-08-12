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
