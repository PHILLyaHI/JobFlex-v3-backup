import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { WorkerActions } from "./worker-actions";
import { money, longDate, shortDate } from "@/lib/format";
import { Mail, Phone } from "lucide-react";

function parseSpec(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default async function WorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireOrg();

  const worker = await db.workerProfile.findUnique({
    where: { id },
    include: {
      user: { select: { email: true, name: true } },
      assignments: {
        include: { job: { select: { id: true, title: true, status: true, startsAt: true } } },
        orderBy: { assignedAt: "desc" },
      },
    },
  });
  if (!worker || worker.organizationId !== organizationId) return notFound();

  const specialties = parseSpec(worker.specialties);

  return (
    <>
      <PageHeader
        eyebrow={`Worker · since ${shortDate(worker.createdAt)}`}
        title={worker.displayName}
        description={worker.user?.email ?? ""}
        actions={<WorkerActions workerId={worker.id} token={worker.token} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1">
          <div className="flex items-center gap-3 mb-5">
            <Avatar name={worker.displayName} size={52} />
            <div>
              <div className="font-display text-[20px] tracking-[-0.015em]">{worker.displayName}</div>
              <div className="text-[11px] text-[color:var(--ink-muted)]">
                {specialties.length > 0 ? specialties.join(" · ") : "No specialties set"}
              </div>
            </div>
          </div>
          <dl className="space-y-2.5 text-[13px]">
            {worker.user?.email && (
              <div className="flex items-center gap-2 text-[color:var(--ink-soft)]">
                <Mail className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                {worker.user.email}
              </div>
            )}
            {worker.phone && (
              <div className="flex items-center gap-2 text-[color:var(--ink-soft)]">
                <Phone className="h-3.5 w-3.5 text-[color:var(--ink-muted)]" />
                {worker.phone}
              </div>
            )}
            <div className="pt-3 mt-3 border-t border-[color:var(--ink-line)]">
              <div className="quiet-caps">Hourly rate</div>
              <div className="font-display tabular text-[22px] mt-1">
                {worker.hourlyRate ? `${money(worker.hourlyRate)}/hr` : "—"}
              </div>
            </div>
          </dl>
          {specialties.length > 0 && (
            <div className="mt-5 pt-5 border-t border-[color:var(--ink-line)]">
              <div className="quiet-caps mb-2">Specialties</div>
              <div className="flex flex-wrap gap-1.5">
                {specialties.map((s) => (
                  <Badge key={s} tone="neutral">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Assignments</CardTitle>
              <CardSubtitle>All jobs this worker has been assigned to.</CardSubtitle>
            </div>
          </CardHeader>
          {worker.assignments.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">No assignments yet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--ink-line)]">
              {worker.assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <Link href={`/dashboard/jobs/${a.job.id}` as any} className="min-w-0">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {a.job.title}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                      {a.job.startsAt ? longDate(a.job.startsAt) : "Unscheduled"}
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone={a.status === "ACCEPTED" ? "success" : a.status === "DECLINED" ? "danger" : "accent"}>
                      {a.status.toLowerCase()}
                    </Badge>
                    <JobStatusBadge status={a.job.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
