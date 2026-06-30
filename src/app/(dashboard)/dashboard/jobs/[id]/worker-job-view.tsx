import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { longDate, shortDate, relative } from "@/lib/format";
import { Calendar, MapPin, User, ImageIcon } from "lucide-react";

// Read-only job view for field workers. Scoped to the worker's own assignment in
// the query (org + assignment), so a worker can never open a job they're not on.
// Deliberately omits expenses, change orders, crew management, and messages —
// those are manager surfaces.
export async function WorkerJobView({
  id,
  organizationId,
  userId,
}: {
  id: string;
  organizationId: string;
  userId: string;
}) {
  const wp = await db.workerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!wp) return notFound();

  const job = await db.job.findFirst({
    where: { id, organizationId, assignments: { some: { workerId: wp.id } } },
    include: {
      client: { select: { name: true, address: true } },
      events: { orderBy: { startsAt: "asc" } },
      photos: { orderBy: { createdAt: "desc" } },
      assignments: { where: { workerId: wp.id }, select: { status: true } },
    },
  });
  if (!job) return notFound();

  const myStatus = job.assignments[0]?.status ?? "PENDING";

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
            ? `${job.client.name}${job.client.address ? ` · ${job.client.address}` : ""}`
            : job.startsAt
              ? longDate(job.startsAt)
              : "Unscheduled"
        }
      />

      <div className="space-y-4">
        {/* Your assignment */}
        <div className="paper-card p-5">
          <div className="quiet-caps mb-3">Your assignment</div>
          <Badge
            tone={
              myStatus === "ACCEPTED"
                ? "success"
                : myStatus === "DECLINED"
                  ? "danger"
                  : myStatus === "COMPLETED"
                    ? "neutral"
                    : "accent"
            }
          >
            {myStatus.toLowerCase()}
          </Badge>
        </div>

        {/* Details */}
        <div className="paper-card p-5 space-y-3">
          <div className="quiet-caps">Details</div>
          {job.startsAt && (
            <div className="flex items-center gap-2.5 text-[13px]">
              <Calendar className="h-4 w-4 text-[color:var(--ink-muted)]" />
              <span>
                {longDate(job.startsAt)}
                {job.endsAt ? ` – ${shortDate(job.endsAt)}` : ""}
              </span>
            </div>
          )}
          {job.client?.name && (
            <div className="flex items-center gap-2.5 text-[13px]">
              <User className="h-4 w-4 text-[color:var(--ink-muted)]" />
              <span>{job.client.name}</span>
            </div>
          )}
          {job.client?.address && (
            <div className="flex items-center gap-2.5 text-[13px]">
              <MapPin className="h-4 w-4 text-[color:var(--ink-muted)]" />
              <span>{job.client.address}</span>
            </div>
          )}
          {job.notes && (
            <div className="pt-1">
              <div className="quiet-caps mb-1.5">Scope</div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--ink-soft)]">
                {job.notes}
              </p>
            </div>
          )}
        </div>

        {/* Schedule */}
        {job.events.length > 0 && (
          <div className="paper-card p-5">
            <div className="quiet-caps mb-3">Schedule</div>
            <ul className="space-y-2">
              {job.events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 border-b border-[color:var(--ink-line)] pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="text-[13px]">{e.title}</span>
                  <span className="tabular shrink-0 text-[11px] text-[color:var(--ink-muted)]">
                    {longDate(e.startsAt)} · {relative(e.startsAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Site photos (read-only) */}
        {job.photos.length > 0 && (
          <div className="paper-card p-5">
            <div className="quiet-caps mb-3 inline-flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5" /> Site photos
            </div>
            <div className="grid grid-cols-3 gap-2">
              {job.photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.url}
                  alt={p.caption ?? "Site photo"}
                  className="aspect-square w-full rounded-[var(--r-sm)] object-cover"
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
