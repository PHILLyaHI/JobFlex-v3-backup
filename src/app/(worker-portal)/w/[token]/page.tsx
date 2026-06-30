import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/Badge";
import { WorkerInviteCard } from "@/components/workers/WorkerInviteCard";
import { longDate, shortDate, relative } from "@/lib/format";
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
  const today = worker.assignments.filter(
    (a) =>
      a.job.startsAt && sameDay(a.job.startsAt, now) && a.status !== "DECLINED",
  );
  const upcoming = worker.assignments.filter(
    (a) =>
      a.job.startsAt && a.job.startsAt > now && !sameDay(a.job.startsAt, now) && a.status !== "DECLINED",
  );
  const past = worker.assignments.filter(
    (a) => a.status === "COMPLETED" || (a.job.startsAt && a.job.startsAt < now && !sameDay(a.job.startsAt, now)),
  );

  return (
    <>
      <div className="quiet-caps mb-2">Welcome back</div>
      <h1 className="font-display text-[34px] tracking-[-0.02em] leading-[1.05]">
        Hi, {worker.displayName.split(" ")[0]}.
      </h1>
      <p className="mt-2 text-[14px] text-[color:var(--ink-muted)]">
        Your jobs. Confirm, upload photos, and stay on schedule — no login needed.
      </p>

      <section className="mt-8">
        <div className="quiet-caps mb-3">Today</div>
        {today.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)] paper-card p-5">
            Nothing on your plate today. Enjoy.
          </p>
        ) : (
          <div className="space-y-2">
            {today.map((a) => (
              <AssignmentLink key={a.id} a={a} token={token} />
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="quiet-caps mb-3">Upcoming</div>
        {upcoming.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No upcoming jobs scheduled yet.
          </p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((a) => (
              <AssignmentLink key={a.id} a={a} token={token} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-8">
          <div className="quiet-caps mb-3">Completed / past</div>
          <div className="space-y-2">
            {past.slice(0, 8).map((a) => (
              <AssignmentLink key={a.id} a={a} token={token} muted />
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

function AssignmentLink({
  a,
  token,
  muted,
}: {
  a: {
    id: string;
    status: string;
    job: { title: string; status: string; startsAt: Date | null; client: { name: string; address: string | null } | null };
  };
  token: string;
  muted?: boolean;
}) {
  return (
    <Link
      href={`/w/${token}/jobs/${a.id}` as any}
      className={
        "paper-card flex items-center gap-4 p-4 transition-all hover:shadow-pop hover:-translate-y-0.5 " +
        (muted ? "opacity-75" : "")
      }
    >
      <div className="h-12 w-12 shrink-0 rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] grid place-items-center font-display text-[15px] tabular">
        {a.job.startsAt ? shortDate(a.job.startsAt).split(" ")[1] : "—"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[color:var(--ink)] truncate">
          {a.job.title}
        </div>
        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 truncate">
          {a.job.client?.name ?? ""} {a.job.client?.address ? ` · ${a.job.client.address}` : ""}
        </div>
        {a.job.startsAt && (
          <div className="text-[10px] text-[color:var(--ink-faint)] mt-0.5">
            {longDate(a.job.startsAt)} · {relative(a.job.startsAt)}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
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
        <ChevronRight className="h-4 w-4 text-[color:var(--ink-muted)]" />
      </div>
    </Link>
  );
}
