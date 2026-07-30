// Mobile projects (mobile-projects-v2) — demo fixture.
//
// Carried over VERBATIM from the desktop projects donor fixture
// (src/components/v3/projects-blueprint/projects-data.ts): same eight records,
// same values, same field names, so the handheld composition is judged against
// the same content as the desktop sheet. Seattle-area contractor texture:
// subdivisions, property-manager turnovers, commercial metal roof, cedar
// fencing; budgets $41,200–$486,000.
//
// The states the page's edge cases hang off, all present in the seed:
//  · all three statuses (4 active / 2 on hold / 2 completed)
//  · one record with NO description (p7 Mill Creek) → the sheet's "no scope"
//    line
//  · one record with NO dates at all (p8 Kirkland) → the mono window line's
//    fallback AND the row sheet's disabled "Open schedule"
//  · two records already at 100% (p6, p7) → the done colourway on the progress
//    rule, and the disabled "Mark completed"
//  · one record at 0% (p5 Willow Park) → the empty progress rule
// Two further states are reachable at runtime rather than in the seed, and by
// design: a project created with the Budget field left blank has budget 0 (the
// em-dash figure) and jobCount 0 (the "no jobs yet" window line) — exactly what
// the desktop create dialog produces.
//
// This is a design surface: the data layer is out of scope, so nothing here
// touches Prisma or a server action. The array is mutated at runtime by the row
// sheet (complete / hold / delete) and by the create form, so the component
// clones this seed per mount.

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  budget: number;
  jobCount: number;
  completedJobs: number;
};

export const PROJECTS_SEED: Project[] = [
  { id: 'p1', name: 'Alder Ridge — Phase 2',      description: 'Eleven-home subdivision: roofs, gutters and perimeter fencing under one budget.', status: 'ACTIVE',    startsAt: 'Jul 08', endsAt: 'Sep 26', budget: 486000, jobCount: 14, completedJobs: 6 },
  { id: 'p2', name: 'Cascade PM — Q3 turnovers',  description: 'Rolling unit turnovers for the property manager: siding patches, deck seal, gutter clears.', status: 'ACTIVE', startsAt: 'Jul 01', endsAt: 'Sep 30', budget: 128400, jobCount: 9, completedJobs: 5 },
  { id: 'p3', name: 'Henderson remodel',          description: 'Full reroof plus deck rebuild on a single property, staged over three visits.', status: 'ACTIVE',    startsAt: 'Jul 22', endsAt: 'Aug 15', budget: 62800,  jobCount: 4,  completedJobs: 1 },
  { id: 'p4', name: 'Northgate LLC — warehouse',  description: 'Commercial metal roof: panel replacement and skylight retrofit across two buildings.', status: 'ON_HOLD', startsAt: 'Jun 12', endsAt: 'Aug 30', budget: 214500, jobCount: 7,  completedJobs: 2 },
  { id: 'p5', name: 'Willow Park fencing',        description: 'Cedar privacy fencing for eight lots, shared materials drop.', status: 'ACTIVE',   startsAt: 'Aug 04', endsAt: 'Sep 12', budget: 74300,  jobCount: 8,  completedJobs: 0 },
  { id: 'p6', name: 'Cypress Ln rebuild',         description: 'Storm damage repair: reroof, gutters, fence gate.', status: 'COMPLETED', startsAt: 'May 06', endsAt: 'Jun 28', budget: 41200,  jobCount: 5,  completedJobs: 5 },
  { id: 'p7', name: 'Mill Creek four-plex',       description: null, status: 'COMPLETED', startsAt: 'Apr 15', endsAt: 'Jun 02', budget: 96700,  jobCount: 6,  completedJobs: 6 },
  { id: 'p8', name: 'Kirkland deck series',       description: 'Three composite decks for repeat clients on the same street.', status: 'ON_HOLD', startsAt: null, endsAt: null, budget: 58900, jobCount: 3, completedJobs: 1 }
];

/** The desktop statuses, verbatim and in the desktop's order. */
export const STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED'];

/**
 * The desktop grid shows all eight cards at once. A handheld project row is
 * three text lines plus a drawn progress rule, so six — the same reasoning that
 * took the clients book from 12 to 8 and the proposals ledger from 8 to 6.
 */
export const PAGE_SIZE = 6;

export type FilterKey =
  | 'ALL'
  | 'ACTIVE'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'UNSCHEDULED'
  | 'NOTSTARTED';

/**
 * The desktop chip rail is All + the three statuses. Two more are added here,
 * on the same grounds the clients page added VIP and Untagged: both are states
 * the book actually holds, both are things you go looking for on a phone, and
 * both fill the 3-column menu to exact rows instead of leaving an orphan cell.
 *  · Unscheduled — no dates on the record (p8). It is also what disables the
 *    row sheet's schedule action, so the filter and the sheet agree.
 *  · Not started — nothing closed out yet (p5).
 */
export const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'ALL', label: 'All projects' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'ON_HOLD', label: 'On hold' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'UNSCHEDULED', label: 'Unscheduled' },
  { key: 'NOTSTARTED', label: 'Not started' },
];

/** "ON_HOLD" → "on hold" — the desktop's own label transform, verbatim. */
export function statusLabel(s: string): string {
  return s.toLowerCase().replace('_', ' ');
}

/** Whole percent of jobs closed out. Guarded: a new project has no jobs yet. */
export function progress(p: Project): number {
  return p.jobCount > 0 ? Math.round((p.completedJobs / p.jobCount) * 100) : 0;
}

export function matchesFilter(p: Project, key: FilterKey): boolean {
  if (key === 'ALL') return true;
  if (key === 'UNSCHEDULED') return !p.startsAt && !p.endsAt;
  if (key === 'NOTSTARTED') return p.completedJobs === 0;
  return p.status === key;
}

/** Name, scope and status label all answer the search box. */
export function matchesQuery(p: Project, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    p.name.toLowerCase().includes(q) ||
    (p.description ?? '').toLowerCase().includes(q) ||
    statusLabel(p.status).includes(q)
  );
}

export function filterCount(list: Project[], key: FilterKey): number {
  return list.filter((p) => matchesFilter(p, key)).length;
}

/**
 * The row's mono annotation line: the delivery window and the job tally in one
 * drawing-annotation string. Both halves degrade on their own, because the
 * fixture holds a record with no dates and the create form makes records with
 * no jobs.
 */
export function windowLabel(p: Project): string {
  const dates = p.startsAt && p.endsAt ? `${p.startsAt} → ${p.endsAt}` : 'No dates set';
  const jobs = p.jobCount > 0 ? `${p.completedJobs}/${p.jobCount} done` : 'No jobs yet';
  return `${dates} · ${jobs}`;
}

/** "2026-08-04" → "Aug 04", the fixture's display format.
 *  Parsed field by field on purpose: `new Date("2026-08-04")` is read as UTC
 *  midnight and renders as the previous day in every negative-offset timezone —
 *  which is every US timezone this product ships to. */
export function shortDate(v: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
}
