import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg, isWorkerRole } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { JobDetail } from "./job-detail";
import { WorkerJobView } from "./worker-job-view";
import { money, longDate } from "@/lib/format";
import { ExternalLink } from "lucide-react";
import { isOpenAIEnabled } from "@/lib/sdk/openai";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, role, user } = await requireOrg();

  // Field workers get a read-only, assignment-scoped view (no expenses, change
  // orders, crew management, or messages).
  if (isWorkerRole(role)) {
    return <WorkerJobView id={id} organizationId={organizationId} userId={user.id} />;
  }

  const job = await db.job.findUnique({
    where: { id },
    include: {
      client: true,
      proposal: { select: { id: true, title: true, publicId: true, total: true } },
      events: { orderBy: { startsAt: "asc" } },
      assignments: {
        include: { worker: { include: { user: { select: { email: true } } } } },
        orderBy: { assignedAt: "asc" },
      },
      photos: { orderBy: { createdAt: "desc" } },
      expenses: { orderBy: { createdAt: "desc" } },
      conversation: {
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true, email: true } } },
          },
        },
      },
      changeOrders: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!job || job.organizationId !== organizationId) return notFound();

  const availableWorkers = await db.workerProfile.findMany({
    where: { organizationId },
    select: {
      id: true,
      displayName: true,
      specialties: true,
      user: { select: { email: true } },
    },
    orderBy: { displayName: "asc" },
  });

  const expenseTotal = job.expenses.reduce((a, e) => a + e.amount, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Job · <JobStatusBadge status={job.status} />
          </span>
        }
        title={job.title}
        description={
          job.client
            ? `${job.client.name}${job.client.address ? ` · ${job.client.address}` : ""}${job.startsAt ? ` · ${longDate(job.startsAt)}` : ""}`
            : job.startsAt
              ? longDate(job.startsAt)
              : "Unscheduled"
        }
        actions={
          <>
            {job.proposal && (
              <Link href={`/dashboard/proposals/${job.proposal.id}` as any}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<ExternalLink className="h-3 w-3" />}
                >
                  Proposal · {money(job.proposal.total)}
                </Button>
              </Link>
            )}
          </>
        }
      />

      <JobDetail
        job={{
          id: job.id,
          title: job.title,
          status: job.status,
          scopeOfWork: job.scopeOfWork,
          notes: job.notes,
          startsAt: job.startsAt,
          endsAt: job.endsAt,
          clientName: job.client?.name ?? null,
          clientEmail: job.client?.email ?? null,
          clientPhone: job.client?.phone ?? null,
          proposalId: job.proposalId,
        }}
        events={job.events.map((e) => ({
          id: e.id,
          title: e.title,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          notes: e.notes,
        }))}
        assignments={job.assignments.map((a) => ({
          id: a.id,
          workerId: a.workerId,
          workerName: a.worker.displayName,
          workerEmail: a.worker.user?.email ?? null,
          status: a.status,
          assignedAt: a.assignedAt,
        }))}
        photos={job.photos.map((p) => ({
          id: p.id,
          url: p.url,
          kind: (p.kind as "BEFORE" | "PROGRESS" | "AFTER") ?? "BEFORE",
          caption: p.caption ?? undefined,
          analysis: p.analysis,
        }))}
        expenses={job.expenses.map((e) => ({
          id: e.id,
          category: e.category,
          amount: e.amount,
          note: e.note,
          createdAt: e.createdAt,
        }))}
        expenseTotal={expenseTotal}
        messages={(job.conversation?.messages ?? []).map((m) => ({
          id: m.id,
          authorId: m.authorId,
          authorName: m.author?.name ?? m.author?.email ?? null,
          body: m.body,
          createdAt: m.createdAt,
        }))}
        availableWorkers={availableWorkers.map((w) => ({
          id: w.id,
          displayName: w.displayName,
          email: w.user?.email ?? null,
          specialties: parseSpecialties(w.specialties),
        }))}
        changeOrders={job.changeOrders.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          amount: c.amount,
          status: c.status,
          publicToken: c.publicToken,
          sentAt: c.sentAt,
          approvedAt: c.approvedAt,
          declinedAt: c.declinedAt,
          createdAt: c.createdAt,
        }))}
        aiEnabled={isOpenAIEnabled()}
      />
    </>
  );
}

function parseSpecialties(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
