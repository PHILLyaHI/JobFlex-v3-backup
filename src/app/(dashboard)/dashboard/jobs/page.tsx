import Link from "next/link";
import { requireOrg, isWorkerRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Plus, Hammer } from "lucide-react";
import { JobsTable, type JobRow } from "./jobs-table";
import { MobileJobsList, type MobileJobRow } from "./mobile-jobs-list";

export default async function JobsPage() {
  const { organizationId, role, user } = await requireOrg();
  const isWorker = isWorkerRole(role);

  // A field worker only sees jobs they're assigned to. Resolve their profile id
  // and scope the query; a missing profile collapses to "no jobs" (never the
  // whole org).
  let workerId: string | null = null;
  if (isWorker) {
    const wp = await db.workerProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    workerId = wp?.id ?? null;
  }

  const jobs = await db.job.findMany({
    where: isWorker
      ? { organizationId, assignments: { some: { workerId: workerId ?? "__none__" } } }
      : { organizationId },
    // Newest job at the top. Was startsAt:asc, which buried just-created jobs at
    // the bottom behind everything already on the calendar.
    orderBy: { createdAt: "desc" },
    include: {
      client: { select: { name: true } },
      assignments: {
        include: { worker: { select: { id: true, displayName: true } } },
      },
    },
  });

  const rows: JobRow[] = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    clientName: j.client?.name ?? null,
    startsAt: j.startsAt,
    endsAt: j.endsAt,
    crewCount: j.assignments.length,
    notes: j.notes,
  }));

  const mobileRows: MobileJobRow[] = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    clientName: j.client?.name ?? null,
    startsAt: j.startsAt,
    endsAt: j.endsAt,
    crew: j.assignments.map((a) => ({ id: a.worker.id, name: a.worker.displayName })),
    notes: j.notes,
  }));

  return (
    <>
      <div className="md:hidden">
        <MobileJobsList rows={mobileRows} />
      </div>
      <div className="hidden md:block">
      <PageHeader
        eyebrow="Delivery"
        title={isWorker ? "My jobs" : "Jobs"}
        description={
          isWorker
            ? "The jobs you've been assigned to. Tap one for the schedule, site, and details."
            : "Every accepted proposal becomes a job. Track schedule, crew, photos, and expenses in one place."
        }
        actions={
          isWorker ? undefined : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Link href={"/dashboard/jobs/new" as any}>
              <Button icon={<Plus className="h-3.5 w-3.5" />}>New job</Button>
            </Link>
          )
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={<Hammer className="h-5 w-5" />}
          title={isWorker ? "No jobs assigned yet" : "No jobs yet"}
          description={
            isWorker
              ? "When the office puts you on a job, it shows up here."
              : "Accept a proposal in the client portal — a job appears here automatically."
          }
        />
      ) : (
        <JobsTable rows={rows} />
      )}
      </div>
    </>
  );
}
