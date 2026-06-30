import Link from "next/link";
import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { money, longDate, shortDate } from "@/lib/format";
import { RevenueSparkline } from "@/components/dashboard/RevenueSparkline";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { LeadKanbanBoard } from "@/components/leads/LeadKanbanBoard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { WeekScheduleCard } from "@/components/dashboard/WeekScheduleCard";
import { ArrowUpRight, Sparkles, FileText } from "lucide-react";
import { cn } from "@/lib/cn";
import { MobileDashboard } from "./mobile-dashboard";

// Grounded resting elevation for the dashboard's content cards. Lifts them off
// the cool-paper background so they read as distinct surfaces, not a blended
// field. shadow-md is the system's "Pop" token, sanctioned for "larger surfaces
// that benefit from definition" (DESIGN.md §4). The `!` beats .paper-card's
// own unlayered resting shadow.
const liftedCard =
  "!shadow-[var(--shadow-md)] transition duration-200 ease-[var(--ease)] hover:-translate-y-0.5 hover:!shadow-[var(--shadow-md)]";

export default async function DashboardOverview() {
  const { organizationId } = await requireOrg();

  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(now.getDate() - 60);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(now.getDate() - 7);

  // Current week, Sunday 00:00 → next Sunday 00:00 (matches the calendar's
  // Sunday-first convention). Drives the "This week" schedule card.
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const ACTIVE_PIPELINE = { notIn: ["DECLINED", "ARCHIVED", "EXPIRED"] };

  // Display lists are capped for rendering; the headline stats below are real
  // org-wide aggregates (counts/sums across ALL rows), not derived from the slice.
  const [
    proposals,
    leads,
    paymentsLast30,
    activities,
    jobEvents,
    pipelineAgg,
    openProposals,
    acceptedProposals,
    activeProposalCount,
    prevRevenueAgg,
    newLeads7,
    unviewedProposals,
    viewedProposals,
    newLeadsTotal,
    weekEvents,
  ] = await Promise.all([
    db.proposal.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { client: { select: { name: true } } },
    }),
    db.lead.findMany({
      where: { organizationId, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        projectType: true,
        description: true,
        aiCategory: true,
        aiConfidence: true,
        createdAt: true,
        assignedTo: { select: { name: true, email: true } },
      },
    }),
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: thirtyDaysAgo } },
      orderBy: { paidAt: "desc" },
      select: { amount: true, paidAt: true },
    }),
    db.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, kind: true, summary: true, createdAt: true },
    }),
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 4,
    }),
    db.proposal.aggregate({
      where: { organizationId, status: ACTIVE_PIPELINE },
      _sum: { total: true },
    }),
    db.proposal.count({ where: { organizationId, status: { in: ["DRAFT", "SENT", "VIEWED"] } } }),
    db.proposal.count({ where: { organizationId, status: { in: ["ACCEPTED", "PAID"] } } }),
    db.proposal.count({ where: { organizationId, status: ACTIVE_PIPELINE } }),
    db.payment.aggregate({
      where: { organizationId, status: "PAID", paidAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _sum: { amount: true },
    }),
    db.lead.count({ where: { organizationId, createdAt: { gte: sevenDaysAgo } } }),
    db.proposal.count({ where: { organizationId, status: "SENT", viewCount: 0 } }),
    db.proposal.count({ where: { organizationId, status: "VIEWED" } }),
    db.lead.count({ where: { organizationId, status: "NEW" } }),
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: weekStart, lt: weekEnd } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true },
    }),
  ]);

  const totalRevenue = paymentsLast30.reduce((acc, p) => acc + p.amount, 0);
  const prevRevenue = prevRevenueAgg._sum.amount ?? 0;
  const pipelineValue = pipelineAgg._sum.total ?? 0;

  // Real 30-day-over-prior-30-day revenue change for the Revenue card delta.
  const revenueDelta: { value: string; direction: "up" | "down" } | undefined =
    prevRevenue > 0
      ? (() => {
          const pct = Math.round(((totalRevenue - prevRevenue) / prevRevenue) * 100);
          return { value: `${pct >= 0 ? "+" : ""}${pct}%`, direction: pct >= 0 ? "up" : "down" };
        })()
      : totalRevenue > 0
        ? { value: "new", direction: "up" }
        : undefined;

  const sparkData = buildSparkline(paymentsLast30);

  return (
    <>
      <div className="md:hidden">
        <MobileDashboard
          now={now}
          jobEvents={jobEvents.map((j) => ({
            id: j.id,
            jobId: j.jobId,
            title: j.title,
            startsAt: j.startsAt,
            notes: j.notes,
          }))}
          attention={{
            unviewed: unviewedProposals,
            viewed: viewedProposals,
            newLeads: newLeadsTotal,
          }}
          activities={activities}
        />
      </div>
      <div className="hidden md:block">
      <PageHeader
        eyebrow={`Good ${greeting()} · ${shortDate(new Date())}`}
        title="Overview"
        description="Everything that needs your attention today — revenue, pipeline, and the next moves."
        actions={
          <>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link href={"/dashboard/advanced-ai" as any}>
              <Button icon={<Sparkles className="h-3.5 w-3.5" />}>Draft with AI</Button>
            </Link>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link href={"/dashboard/proposals/new" as any}>
              <Button variant="outline" icon={<FileText className="h-3.5 w-3.5" />}>
                Manual proposal
              </Button>
            </Link>
          </>
        }
      />

      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          hover
          label="Revenue · 30d"
          value={money(totalRevenue)}
          delta={revenueDelta}
          hint="Collected across all providers"
        />
        <StatCard
          hover
          label="Pipeline value"
          value={money(pipelineValue)}
          hint={`${activeProposalCount} active proposal${activeProposalCount === 1 ? "" : "s"}`}
        />
        <StatCard
          hover
          label="Open proposals"
          value={String(openProposals)}
          delta={acceptedProposals > 0 ? { value: `${acceptedProposals} won`, direction: "up" } : undefined}
          accent
        />
        <StatCard
          hover
          label="New leads · 7d"
          value={String(newLeads7)}
          hint="AI-categorized, ready to triage"
        />
      </StaggerGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
        <Card className={cn(liftedCard, "lg:col-span-2")}>
          <RevenueSparkline data={sparkData} />
        </Card>

        <Card className={liftedCard}>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardSubtitle>Who did what, just now</CardSubtitle>
            </div>
          </CardHeader>
          <ActivityFeed items={activities} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6">
        <Card className={liftedCard}>
          <WeekScheduleCard
            weekStart={weekStart}
            now={now}
            events={weekEvents}
            calendarHref="/dashboard/calendar"
          />
        </Card>

        <Card className={liftedCard}>
          <CardHeader>
            <div>
              <CardTitle>Upcoming jobs</CardTitle>
              <CardSubtitle>Next installs on the calendar</CardSubtitle>
            </div>
          </CardHeader>
          {jobEvents.length === 0 ? (
            <p className="text-[12px] text-[color:var(--ink-muted)]">Your calendar is clear.</p>
          ) : (
            <ul className="space-y-3">
              {jobEvents.map((j) => (
                <li key={j.id} className="flex gap-3 items-start">
                  <div className="h-10 w-10 shrink-0 rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] grid place-items-center font-display text-[14px] tabular">
                    {shortDate(j.startsAt).split(" ")[1]}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-[color:var(--ink)]">{j.title}</div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                      {longDate(j.startsAt)} — {j.notes ?? "scheduled"}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <section className="mt-10">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="quiet-caps mb-1">Pipeline</div>
            <h2 className="font-display text-[24px] tracking-[-0.015em]">Lead flow</h2>
          </div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Link href={"/dashboard/leads" as any} className="text-[12px] text-[color:var(--ink-muted)] inline-flex items-center gap-1">
            Open leads <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <LeadKanbanBoard
          heightClass="h-[460px]"
          leads={leads.map((l) => ({
            id: l.id,
            name: l.name,
            email: l.email,
            phone: l.phone,
            projectType: l.projectType,
            description: l.description,
            status: l.status,
            aiCategory: l.aiCategory,
            aiConfidence: l.aiConfidence,
            createdAt: l.createdAt,
            assignee: l.assignedTo?.name ?? l.assignedTo?.email ?? null,
          }))}
        />
      </section>

      <section className="mt-10">
        <Card className={liftedCard}>
          <CardHeader>
            <div>
              <CardTitle>Latest proposals</CardTitle>
              <CardSubtitle>Draft, sent, viewed, or accepted</CardSubtitle>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link href={"/dashboard/proposals" as any} className="text-[12px] text-[color:var(--ink-muted)]">
              View all →
            </Link>
          </CardHeader>
          <div className="divide-y divide-[color:var(--ink-line)]">
            {proposals.slice(0, 6).map((p) => (
              <Link
                key={p.id}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={`/dashboard/proposals/${p.id}` as any}
                className="flex items-center justify-between py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03] -mx-6 px-6 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">{p.title}</div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                    {p.client?.name ?? "Unassigned"} · updated {shortDate(p.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  <span className="font-display tabular text-[15px] text-[color:var(--ink)]">
                    {money(p.total)}
                  </span>
                </div>
              </Link>
            ))}
            {proposals.length === 0 && (
              <div className="py-8 text-center text-[12px] text-[color:var(--ink-muted)]">
                No proposals yet. Draft your first one.
              </div>
            )}
          </div>
        </Card>
      </section>
      </div>
    </>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}

function statusTone(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  if (s === "DRAFT") return "neutral";
  return "neutral";
}

function buildSparkline(payments: { amount: number; paidAt: Date | null }[]) {
  const days: { day: string; revenue: number; iso: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
    const sum = payments
      .filter((p) => p.paidAt && p.paidAt.toISOString().slice(0, 10) === key)
      .reduce((acc, p) => acc + p.amount, 0);
    days.push({ day: label, revenue: sum, iso: key });
  }
  return days;
}
