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
import { PipelineBoard } from "@/components/dashboard/PipelineBoard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { ArrowUpRight, Sparkles, FileText } from "lucide-react";
import { MobileDashboard } from "./mobile-dashboard";

export default async function DashboardOverview() {
  const { organizationId } = await requireOrg();

  const [proposals, leads, payments, activities, jobEvents] = await Promise.all([
    db.proposal.findMany({
      where: { organizationId },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: { client: { select: { name: true } } },
    }),
    db.lead.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { id: true, name: true, status: true, projectType: true, aiCategory: true },
    }),
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { not: null } },
      orderBy: { paidAt: "desc" },
      take: 30,
    }),
    db.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, kind: true, summary: true, createdAt: true },
    }),
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: new Date() } },
      orderBy: { startsAt: "asc" },
      take: 4,
    }),
  ]);

  const totalRevenue = payments.reduce((acc, p) => acc + p.amount, 0);
  const openProposals = proposals.filter((p) => ["DRAFT", "SENT", "VIEWED"].includes(p.status)).length;
  const acceptedProposals = proposals.filter((p) => p.status === "ACCEPTED" || p.status === "PAID").length;
  const pipelineValue = proposals
    .filter((p) => p.status !== "DECLINED" && p.status !== "ARCHIVED" && p.status !== "EXPIRED")
    .reduce((acc, p) => acc + p.total, 0);

  const sparkData = buildSparkline(payments);
  const now = new Date();

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
          proposals={proposals.map((p) => ({
            status: p.status,
            viewCount: p.viewCount ?? 0,
          }))}
          leads={leads.map((l) => ({ status: l.status }))}
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
            <Link href={"/dashboard/proposals/ai" as any}>
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
          label="Revenue · 30d"
          value={money(totalRevenue)}
          delta={{ value: "+18%", direction: "up" }}
          hint="Collected across all providers"
        />
        <StatCard
          label="Pipeline value"
          value={money(pipelineValue)}
          hint={`${proposals.length} active proposals`}
        />
        <StatCard
          label="Open proposals"
          value={String(openProposals)}
          delta={{ value: `${acceptedProposals} won`, direction: "up" }}
          accent
        />
        <StatCard
          label="New leads · 7d"
          value={String(leads.slice(0, 20).length)}
          hint="AI-categorized, ready to triage"
        />
      </StaggerGrid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Revenue trend</CardTitle>
              <CardSubtitle>Paid invoices over the last 30 days</CardSubtitle>
            </div>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <Link href={"/dashboard/reports" as any} className="text-[12px] text-[color:var(--ink-muted)] inline-flex items-center gap-1 hover:text-[color:var(--ink)]">
              View reports <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <RevenueSparkline data={sparkData} />
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent activity</CardTitle>
              <CardSubtitle>Who did what, just now</CardSubtitle>
            </div>
          </CardHeader>
          <ActivityFeed items={activities} />
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
        <PipelineBoard leads={leads.slice(0, 24)} />
      </section>

      <section className="mt-10 grid grid-cols-1 lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-3">
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

        <Card className="lg:col-span-2">
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
  const days: { day: string; revenue: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().slice(0, 10);
    const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
    const sum = payments
      .filter((p) => p.paidAt && p.paidAt.toISOString().slice(0, 10) === key)
      .reduce((acc, p) => acc + p.amount, 0);
    days.push({ day: label, revenue: sum });
  }
  return days;
}
