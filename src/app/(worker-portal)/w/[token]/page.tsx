import { notFound, redirect } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/Badge";
import { WorkerInviteCard } from "@/components/workers/WorkerInviteCard";
import { JobResponseCard } from "./job-response";
import { longDate, shortDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { ChevronRight } from "lucide-react";

export default async function WorkerDashboard({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const worker = await db.workerProfile.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
      user: { select: { id: true, email: true, hashedPassword: true } },
      assignments: {
        include: {
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              startsAt: true,
              endsAt: true,
              client: { select: { name: true, address: true } },
            },
          },
        },
        orderBy: { job: { startsAt: "asc" } },
      },
    },
  });
  if (!worker) return notFound();

  // Role lives on the membership; surface the real one on the invite card.
  const membership = await db.membership.findUnique({
    where: {
      userId_organizationId: { userId: worker.userId, organizationId: worker.organizationId },
    },
    select: { role: true },
  });
  const role = membership?.role ?? "INSTALLER";

  // ── Invite gate ──────────────────────────────────────────────────────────
  // The magic link is the invite link until the worker responds.
  if (worker.inviteStatus === "PENDING") {
    return (
      <WorkerInviteCard
        token={token}
        orgName={worker.organization?.name ?? "the team"}
        workerName={worker.displayName}
        email={worker.user?.email ?? ""}
        role={role}
      />
    );
  }
  if (worker.inviteStatus === "DECLINED") {
    return (
      <div className="max-w-md mx-auto paper-card p-10 text-center">
        <h1 className="font-display text-[26px] leading-[1.1] tracking-[-0.02em]">
          Invite declined
        </h1>
        <p className="mt-2 text-[13px] text-[color:var(--ink-muted)]">
          This invitation was declined. Ask {worker.organization?.name ?? "your manager"} to send a
          new one if you&apos;d like to join.
        </p>
      </div>
    );
  }
  // ACCEPTED with a real password → the magic link becomes the dashboard link.
  // Legacy passwordless workers keep this token portal so they're never locked out.
  if (worker.user?.hashedPassword) {
    const session = await auth();
    if (session?.user?.id === worker.userId) redirect("/dashboard/jobs");
    redirect(`/auth/login?next=/dashboard/jobs`);
  }

  const now = new Date();
  // Jobs the office is waiting on — surfaced first, above the schedule.
  const needsResponse = worker.assignments.filter(
    (a) => a.status === "PENDING" && a.job.status !== "CANCELED",
  );
  const today = worker.assignments.filter(
    (a) =>
      a.status !== "PENDING" &&
      a.status !== "DECLINED" &&
      a.job.startsAt &&
      sameDay(a.job.startsAt, now),
  );
  const upcoming = worker.assignments.filter(
    (a) =>
      a.status !== "PENDING" &&
      a.status !== "DECLINED" &&
      a.job.startsAt &&
      a.job.startsAt > now &&
      !sameDay(a.job.startsAt, now),
  );
  const past = worker.assignments.filter(
    (a) =>
      a.status === "COMPLETED" ||
      (a.status !== "PENDING" &&
        a.job.startsAt &&
        a.job.startsAt < now &&
        !sameDay(a.job.startsAt, now)),
  );

  return (
    <>
      <div className="quiet-caps mb-2">Your jobs</div>
      <h1 className="font-display text-[34px] tracking-[-0.02em] leading-[1.05]">
        Hi, {worker.displayName.split(" ")[0]}.
      </h1>
      <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">
        Confirm the jobs sent your way, get directions, and log receipts — no login needed.
      </p>

      {needsResponse.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="quiet-caps">Needs your response</span>
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">
              {needsResponse.length}
            </span>
          </div>
          <div className="space-y-2.5">
            {needsResponse.map((a) => (
              <JobResponseCard
                key={a.id}
                token={token}
                job={{
                  id: a.id,
                  title: a.job.title,
                  clientName: a.job.client?.name ?? null,
                  startsAt: a.job.startsAt,
                }}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <div className="quiet-caps mb-3">Today</div>
        {today.length === 0 ? (
          <p className="paper-card p-5 text-[12px] text-[color:var(--ink-muted)]">
            Nothing on your plate today. Enjoy.
          </p>
        ) : (
          <div className="space-y-2.5">
            {today.map((a) => (
              <AssignmentCard key={a.id} a={a} token={token} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="quiet-caps mb-3">Upcoming</div>
        {upcoming.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No upcoming jobs scheduled yet.</p>
        ) : (
          <div className="space-y-2.5">
            {upcoming.map((a) => (
              <AssignmentCard key={a.id} a={a} token={token} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <div className="quiet-caps mb-3">Completed / past</div>
          <div className="space-y-2.5">
            {past.slice(0, 8).map((a) => (
              <AssignmentCard key={a.id} a={a} token={token} muted />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function AssignmentCard({
  a,
  token,
  muted,
}: {
  a: {
    id: string;
    status: string;
    job: {
      title: string;
      status: string;
      startsAt: Date | null;
      client: { name: string; address: string | null } | null;
    };
  };
  token: string;
  muted?: boolean;
}) {
  const start = a.job.startsAt;
  const [mon, day] = start ? shortDate(start).split(" ") : ["—", ""];
  return (
    <Link
      href={`/w/${token}/jobs/${a.id}` as Route}
      className={cn(
        "group flex items-center gap-3.5 paper-card p-3.5 transition-all hover:shadow-pop hover:-translate-y-0.5",
        muted && "opacity-70",
      )}
    >
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--r-md)] bg-[color:var(--ink)] text-white">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/60">
          {mon}
        </span>
        <span className="font-display text-[20px] leading-none tabular">{day || "—"}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-semibold text-[color:var(--ink)]">
          {a.job.title}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-[color:var(--ink-muted)]">
          {a.job.client?.name ?? ""}
          {a.job.client?.address ? ` · ${a.job.client.address}` : ""}
        </div>
        {start && (
          <div className="mt-0.5 text-[11px] tabular text-[color:var(--ink-faint)]">
            {longDate(start)}
          </div>
        )}
      </div>
      <Badge
        tone={
          a.status === "ACCEPTED"
            ? "success"
            : a.status === "DECLINED"
              ? "danger"
              : a.status === "COMPLETED"
                ? "neutral"
                : "accent"
        }
      >
        {a.status.toLowerCase()}
      </Badge>
      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--ink-faint)]" />
    </Link>
  );
}
