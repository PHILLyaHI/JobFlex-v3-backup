// Main jobs — Blueprint edition. Pixel-identical port of the canonical jobs
// donor (jobflex-jobs-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/new, /[id]) live under the (dashboard) route group and keep
// the classic layout.
//
// Like Workers, this is NOT a fixture: the board is read from the database here
// and the dialog / row menu call the real job server actions (see
// jobs-behavior.ts). The query is the archived classic page's — same joins,
// same `createdAt: desc` ordering, same field-worker scoping — so both editions
// describe the same board. The two option lists (clients, crew) are the classic
// /dashboard/jobs/new page's queries, because the create dialog replaces that
// form on this surface.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, isWorkerRole, isOwnerOrManager, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { JobsContent } from "@/components/v3/jobs-blueprint/jobs-content";
import { toDay, type Job, type JobClientOption, type JobCrewOption, type JobStatus } from "@/components/v3/jobs-blueprint/jobs-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Jobs",
  description: "Jobs — status tabs and the full delivery board on one sheet.",
};

export default async function JobsPage() {
  let organizationId: string;
  let role: string | null;
  let userId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
    userId = ctx.user.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Fjobs");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const isWorker = isWorkerRole(role);
  const canManage = isOwnerOrManager(role);

  // A field worker only sees jobs they're assigned to. Resolve their profile id
  // and scope the query; a missing profile collapses to "no jobs" (never the
  // whole org).
  let workerId: string | null = null;
  if (isWorker) {
    const wp = await db.workerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    workerId = wp?.id ?? null;
  }

  const [jobs, clientRows, workerRows] = await Promise.all([
    db.job.findMany({
      where: isWorker
        ? { organizationId, assignments: { some: { workerId: workerId ?? "__none__" } } }
        : { organizationId },
      // Newest job at the top — the classic page's ordering. Was startsAt:asc,
      // which buried just-created jobs at the bottom.
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true } },
        assignments: { include: { worker: { select: { id: true, displayName: true } } } },
      },
    }),
    db.client.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Installers are auto-assigned to their own jobs server-side and can't staff
    // anyone else, so they get no crew list at all.
    isWorker
      ? Promise.resolve([] as JobCrewOption[])
      : db.workerProfile.findMany({
          where: { organizationId },
          orderBy: { displayName: "asc" },
          select: { id: true, displayName: true },
        }),
  ]);

  const entries: Job[] = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    client: j.client?.name ?? null,
    status: j.status as JobStatus,
    start: toDay(j.startsAt),
    end: toDay(j.endsAt),
    crew: j.assignments.map((a) => a.worker.displayName),
  }));

  const clients: JobClientOption[] = clientRows.map((c) => ({ id: c.id, name: c.name }));
  const crew: JobCrewOption[] = (workerRows as { id: string; displayName: string }[]).map((w) => ({
    id: w.id,
    name: w.displayName,
  }));

  return <JobsContent entries={entries} clients={clients} crew={crew} canManage={canManage} />;
}
