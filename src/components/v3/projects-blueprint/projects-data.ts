// Projects blueprint — demo fixture data, verbatim from the donor file
// jobflex-projects-blueprint_2.html (script section). Values must not be
// edited independently of the donor: the page is a pixel-identical port,
// content included.
//
// Shape mirrors ProjectCardData: name, description, status, startsAt, endsAt,
// budget, jobCount, completedJobs. Statuses: ACTIVE | ON_HOLD | COMPLETED.

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

export const STATUSES = ['ACTIVE', 'ON_HOLD', 'COMPLETED'];
