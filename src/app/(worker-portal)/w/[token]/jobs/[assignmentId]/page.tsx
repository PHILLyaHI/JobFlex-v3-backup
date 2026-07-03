import { notFound } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { Avatar } from "@/components/ui/Avatar";
import { longDate } from "@/lib/format";
import { AssignmentResponse } from "./assignment-response";
import { WorkerJobPanel } from "./assignment-panel";
import { whenLabel, timeRange, directionsUrl, gcalUrl, prettyRole } from "./helpers";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Navigation,
  CalendarPlus,
  ClipboardList,
  Users,
} from "lucide-react";

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
          expenses: { orderBy: { createdAt: "desc" } },
          assignments: {
            include: { worker: { select: { id: true, userId: true, displayName: true } } },
          },
        },
      },
    },
  });
  if (!assignment || assignment.workerId !== worker.id) return notFound();

  const job = assignment.job;

  // Crew roster — roles live on Membership, so resolve them in one lookup.
  const userIds = job.assignments.map((a) => a.worker.userId);
  const memberships = userIds.length
    ? await db.membership.findMany({
        where: { organizationId: worker.organizationId, userId: { in: userIds } },
        select: { userId: true, role: true },
      })
    : [];
  const roleByUser = new Map(memberships.map((m) => [m.userId, m.role]));
  const crew = job.assignments.map((a) => ({
    id: a.worker.id,
    name: a.worker.displayName,
    role: prettyRole(roleByUser.get(a.worker.userId) ?? "INSTALLER"),
    isMe: a.worker.id === worker.id,
  }));

  const address =
    [job.client?.address, job.client?.city, job.client?.state].filter(Boolean).join(", ") || null;
  const scope = job.scopeOfWork ?? job.notes ?? null;

  return (
    <>
      <Link
        href={`/w/${token}` as Route}
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--ink-muted)] transition-colors hover:text-[color:var(--ink)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> All jobs
      </Link>

      {/* Command hero — charcoal anchor */}
      <header className="overflow-hidden rounded-[var(--r-lg)] bg-[color:var(--ink)] p-6 shadow-[var(--shadow-md)] sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/45">
            Work order · #{job.id.slice(0, 6).toUpperCase()}
          </span>
          <span className="rounded-full bg-[color:var(--accent)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
            {job.status.replace("_", " ").toLowerCase()}
          </span>
        </div>
        <h1 className="mt-4 font-display text-[30px] leading-[1.03] tracking-[-0.025em] text-white sm:text-[36px]">
          {job.title}
        </h1>
        {job.client?.name && <p className="mt-2 text-[13.5px] text-white/55">for {job.client.name}</p>}
        {job.startsAt && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[13px] font-semibold text-white">
              <Clock className="h-3.5 w-3.5" />
              {whenLabel(job.startsAt)}
            </span>
            <span className="text-[12.5px] tabular text-white/45">
              {longDate(job.startsAt)} · {timeRange(job.startsAt, job.endsAt)}
            </span>
          </div>
        )}
      </header>

      {/* Accept / decline — the primary decision */}
      <AssignmentResponse assignmentId={assignment.id} token={token} status={assignment.status} />

      {/* Where */}
      <section className="mt-4 paper-card p-5">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-faint)]">
          <MapPin className="h-3.5 w-3.5" /> Where
        </div>
        {job.client?.name && (
          <div className="mt-2.5 text-[15px] font-semibold text-[color:var(--ink)]">
            {job.client.name}
          </div>
        )}
        <div className="mt-0.5 text-[13px] leading-relaxed text-[color:var(--ink-muted)]">
          {address ?? "No address on file"}
        </div>
        {job.client?.phone && (
          <a
            href={`tel:${job.client.phone}`}
            className="mt-1 inline-block text-[13px] font-medium text-[color:var(--accent-ink)]"
          >
            {job.client.phone}
          </a>
        )}
        {address && (
          <a
            href={directionsUrl(address)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex h-12 items-center justify-center gap-2 rounded-[var(--r-md)] bg-[color:var(--accent)] text-[14px] font-semibold text-white shadow-[var(--shadow-sm)] transition-all hover:bg-[color:var(--accent-ink)] active:scale-[0.99] focus-ring"
          >
            <Navigation className="h-4 w-4" /> Get directions
          </a>
        )}
        {job.startsAt && (
          <a
            href={gcalUrl(job.title, job.startsAt, job.endsAt, address)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2.5 flex h-11 items-center justify-center gap-2 rounded-[var(--r-md)] hairline text-[13px] font-semibold text-[color:var(--ink-soft)] transition-colors hover:bg-black/[0.02] focus-ring"
          >
            <CalendarPlus className="h-4 w-4" /> Add to calendar
          </a>
        )}
      </section>

      {/* Scope of work */}
      {scope && (
        <section className="mt-4 paper-card p-5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-faint)]">
            <ClipboardList className="h-3.5 w-3.5" /> Scope of work
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-[1.65] text-[color:var(--ink-soft)]">
            {scope}
          </p>
        </section>
      )}

      {/* Crew */}
      {crew.length > 0 && (
        <section className="mt-4 paper-card p-5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ink-faint)]">
            <Users className="h-3.5 w-3.5" /> On the crew{" "}
            <span className="tabular text-[color:var(--ink-faint)]">{crew.length}</span>
          </div>
          <ul className="mt-3.5 space-y-3">
            {crew.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <Avatar name={c.name} size={34} />
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-[color:var(--ink)]">
                    {c.name}
                    {c.isMe && (
                      <span className="ml-1.5 text-[11px] font-medium text-[color:var(--accent-ink)]">
                        you
                      </span>
                    )}
                  </div>
                  <div className="text-[12px] text-[color:var(--ink-muted)]">{c.role}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Status · receipts · photos */}
      <WorkerJobPanel
        jobId={job.id}
        token={token}
        jobStatus={job.status}
        photos={job.photos.map((p) => ({
          id: p.id,
          url: p.url,
          kind: (p.kind as "BEFORE" | "PROGRESS" | "AFTER") ?? "BEFORE",
          caption: p.caption ?? undefined,
        }))}
        receipts={job.expenses.map((e) => ({
          id: e.id,
          category: e.category,
          amount: e.amount,
          note: e.note,
          receiptUrl: e.receiptUrl,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
