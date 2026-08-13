// Demo data for the project + project-detail surfaces.
//
// Adds three realistic projects with a spread of jobs to the Acme Contracting
// demo organization so /dashboard/projects/<id> (and its handheld build) can be
// reviewed against real records instead of an empty shell: mixed statuses,
// dated and undated jobs, a project window that brackets today, a project with
// no window at all, and a handful of unassigned jobs left over so the attach
// panel has candidates.
//
// Data only — no schema change, no migration. Idempotent: a project is skipped
// if one with the same name already exists in the org.
//
//   DATABASE_URL="file:C:/joblfex-v3/prisma/dev.db" node scripts/seed-project-demo.mjs

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const ORG_NAME = "Acme Contracting";
const DAY = 86400000;
const today = new Date();
today.setHours(9, 0, 0, 0);
const at = (days, hour = 9) => {
  const d = new Date(today.getTime() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

const PLAN = [
  {
    name: "Willow Park — Cedar Fencing",
    description:
      "Cedar privacy fencing for eight lots off Willow Park Drive, shared materials drop and one crew rotating through the phases.",
    status: "ACTIVE",
    startsAt: at(-38),
    endsAt: at(46),
    budget: 128400,
    jobs: [
      { title: "Site walk & string lines", status: "COMPLETED", s: -38, e: -37 },
      { title: "Lots 1-3 post setting", status: "COMPLETED", s: -31, e: -25 },
      { title: "Lots 1-3 panel hang", status: "IN_PROGRESS", s: -9, e: 4 },
      { title: "Lots 4-6 post setting", status: "SCHEDULED", s: 8, e: 17 },
      { title: "Lots 4-6 panel hang", status: "SCHEDULED", s: 20, e: 30 },
      { title: "Gates & hardware", status: "SCHEDULED", s: 33, e: 38 },
      { title: "Stain & final walk", status: "SCHEDULED", s: 41, e: 46 },
      // No dates: exercises the "n jobs have no start date" note in the
      // schedule and timeline views.
      { title: "Punch list — owner callbacks", status: "SCHEDULED", s: null, e: null },
    ],
  },
  {
    name: "Harborview Deck & Rail",
    description:
      "Composite deck replacement over the existing frame, cable rail, and a re-flashed ledger on the water side.",
    status: "ACTIVE",
    startsAt: at(-12),
    endsAt: at(21),
    budget: 46750,
    jobs: [
      { title: "Demo old decking", status: "COMPLETED", s: -12, e: -10 },
      { title: "Frame repair & ledger flashing", status: "IN_PROGRESS", s: -6, e: 2 },
      { title: "Composite deck boards", status: "SCHEDULED", s: 4, e: 11 },
      { title: "Cable rail install", status: "SCHEDULED", s: 13, e: 18 },
      // Start, no end: exercises the minimum-width bar + "no end date".
      { title: "Final inspection", status: "SCHEDULED", s: 21, e: null },
      { title: "Weather hold — rail delivery", status: "CANCELED", s: 6, e: 7 },
    ],
  },
  {
    name: "Ridgeway Shop Fit-out",
    description: "Interior fit-out for the Ridgeway service shop. Scheduling waits on the permit.",
    status: "ON_HOLD",
    // Deliberately no window: exercises the "No window set" dateline and the
    // fallback that measures the timeline off the jobs themselves.
    startsAt: null,
    endsAt: null,
    budget: 0,
    jobs: [
      { title: "Permit resubmission", status: "IN_PROGRESS", s: -3, e: 9 },
      { title: "Rough electrical", status: "SCHEDULED", s: 26, e: 34 },
      { title: "Mezzanine steel", status: "SCHEDULED", s: null, e: null },
    ],
  },
];

const org = await db.organization.findFirst({ where: { name: ORG_NAME } });
if (!org) throw new Error(`No organization named "${ORG_NAME}" in this database`);

const clients = await db.client.findMany({
  where: { organizationId: org.id },
  select: { id: true, name: true },
  orderBy: { createdAt: "desc" },
  take: 6,
});

for (const [pi, p] of PLAN.entries()) {
  const existing = await db.project.findFirst({
    where: { organizationId: org.id, name: p.name },
    select: { id: true },
  });
  if (existing) {
    console.log(`skip  ${p.name} — already seeded (${existing.id})`);
    continue;
  }

  const project = await db.project.create({
    data: {
      organizationId: org.id,
      name: p.name,
      description: p.description,
      status: p.status,
      startsAt: p.startsAt,
      endsAt: p.endsAt,
      budget: p.budget,
    },
  });

  for (const [ji, j] of p.jobs.entries()) {
    // Rotate the demo clients so the rows carry real names, and leave every
    // third job unassigned so the "Unassigned" branch is drawn too.
    const client = (pi + ji) % 3 === 2 ? null : clients[(pi * 3 + ji) % Math.max(1, clients.length)];
    await db.job.create({
      data: {
        organizationId: org.id,
        projectId: project.id,
        clientId: client?.id ?? null,
        title: j.title,
        status: j.status,
        startsAt: j.s === null ? null : at(j.s),
        endsAt: j.e === null ? null : at(j.e, 17),
      },
    });
  }

  console.log(`seed  ${p.name} — ${p.jobs.length} jobs — /dashboard/projects/${project.id}`);
}

await db.$disconnect();
