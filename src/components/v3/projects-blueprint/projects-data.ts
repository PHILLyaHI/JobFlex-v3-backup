// Projects blueprint — the page's row shape and its status vocabulary.
//
// The donor (jobflex-projects-blueprint_2.html) shipped an eight-record demo
// fixture here. It is GONE: the grid is read from the database in the page's
// server component (src/app/dashboard/projects/page.tsx) and handed in as
// props, so a fixture could only ever be a fallback that quietly showed one
// org another org's book. Nothing below is record-shaped.
//
// Shape mirrors the server component's mapping: name, description, status,
// startsAt, endsAt (short "Jul 08" plates), budget, jobCount, completedJobs.
// It is `ProjectBookRow` in @/actions/projects, re-declared here only so the
// blueprint modules do not import a server-action module into the client
// bundle for a type.

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

/** The three statuses the filter rail and the create dialog offer. ARCHIVED is
 *  deliberately absent: the page's query hides archived projects. */
export const STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED'];
