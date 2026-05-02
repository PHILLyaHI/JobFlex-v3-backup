import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { WorkerAssignmentPanel } from "./assignment-panel";
import { longDate, shortDate } from "@/lib/format";
import { Calendar, MapPin, User } from "lucide-react";

export default async function WorkerAssignmentPage({
  params,
}: {
  params: Promise<{ token: string; assignmentId: string }>;
}) {
  const { token, assignmentId } = await params;
  const worker = await db.workerProfile.findUnique({ where: { token } });
  if (!worker) return notFound();

  const assignment = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      job: {
        include: {
          client: true,
          photos: { orderBy: { createdAt: "desc" } },
          messages: { orderBy: { createdAt: "desc" }, take: 10 },
        },
      },
    },
  });
  if (!assignment || assignment.workerId !== worker.id) return notFound();

  const job = assignment.job;

  return (
    <>
      <div className="flex items-center gap-2 mb-2">
        <Badge
          tone={
            assignment.status === "ACCEPTED"
              ? "success"
              : assignment.status === "DECLINED"
                ? "danger"
                : "accent"
          }
        >
          {assignment.status.toLowerCase()}
        </Badge>
        <JobStatusBadge status={job.status} />
      </div>
      <h1 className="font-display text-[30px] tracking-[-0.02em] leading-tight">{job.title}</h1>

      <Card className="mt-6">
        <div className="space-y-3 text-[13px] text-[color:var(--ink-soft)]">
          {job.startsAt && (
            <div className="flex items-center gap-2.5">
              <Calendar className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
              {longDate(job.startsAt)}
              {job.endsAt && ` → ${shortDate(job.endsAt)}`}
            </div>
          )}
          {job.client?.name && (
            <div className="flex items-center gap-2.5">
              <User className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
              {job.client.name}
            </div>
          )}
          {(job.client?.address || job.client?.city) && (
            <div className="flex items-center gap-2.5">
              <MapPin className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
              {[job.client?.address, job.client?.city, job.client?.state]
                .filter(Boolean)
                .join(", ")}
            </div>
          )}
        </div>
        {job.notes && (
          <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
            <div className="quiet-caps mb-2">Scope / notes</div>
            <p className="text-[13px] leading-relaxed text-[color:var(--ink-soft)] whitespace-pre-wrap">
              {job.notes}
            </p>
          </div>
        )}
      </Card>

      <WorkerAssignmentPanel
        assignmentId={assignment.id}
        jobId={job.id}
        status={assignment.status}
        token={token}
        photos={job.photos.map((p) => ({
          id: p.id,
          url: p.url,
          kind: (p.kind as "BEFORE" | "PROGRESS" | "AFTER") ?? "BEFORE",
          caption: p.caption ?? undefined,
        }))}
      />
    </>
  );
}
