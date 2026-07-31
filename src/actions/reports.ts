// Reports — read-only aggregates for /dashboard/reports.
//
// This module exists because there was no reports implementation to reuse: the
// classic page (archived at old-design-pages/dashboard/reports/page.tsx) is a
// `<ComingSoon />` placeholder, and financials.ts only rolls up revenue vs
// EXPENSES, which is a different chart from the reports sheet's invoiced vs
// COLLECTED. Everything here is a plain `db` read — no mutations, no
// "use server" boundary — in the same shape as financials.ts.
//
// One pass over a trailing-12-month window feeds all four ranges; each range is
// then a filter over the same in-memory rows rather than four more round trips.

import { db } from "@/lib/db";
import { WORKER_ROLES } from "@/components/v3/workers-blueprint/workers-data";

export type RangeKey = "mtd" | "q" | "ytd" | "12m";
export type RangeDef = { key: RangeKey; label: string; note: string };
export type MonthPoint = { m: string; invoiced: number; collected: number };
/** A funnel step: [label, count]. */
export type FunnelStep = [string, number];
export type CrewMember = {
  name: string;
  role: string;
  jobs: number;
  hours: number;
  revenue: number;
  rating: number | null;
};

export type ReportsRollup = {
  ranges: RangeDef[];
  /** Trailing 12 calendar months, oldest first. */
  months: MonthPoint[];
  /** How many trailing month buckets each range covers. */
  rangeMonths: Record<RangeKey, number>;
  funnel: Record<RangeKey, FunnelStep[]>;
  crew: Record<RangeKey, CrewMember[]>;
  /** Mean days from proposal sent to accepted, per range. Null when nothing
   *  closed in the range — the sheet prints an em dash rather than a zero. */
  avgDaysToClose: Record<RangeKey, number | null>;
};

const RANGE_KEYS: RangeKey[] = ["mtd", "q", "ytd", "12m"];

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short" });
}
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function dayNote(a: Date, b: Date): string {
  const l = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${l(a)} – ${l(b)}, ${b.getFullYear()}`;
}
function monthNote(a: Date, b: Date): string {
  const l = (d: Date) => d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return `${l(a)} – ${l(b)}`;
}

const ROLE_LABEL = new Map(WORKER_ROLES.map((r) => [r.value as string, r.label]));
function roleLabel(role: string | undefined): string {
  if (!role) return "Crew";
  return ROLE_LABEL.get(role) ?? role.charAt(0) + role.slice(1).toLowerCase();
}

export async function getReportsRollup(organizationId: string): Promise<ReportsRollup> {
  const now = new Date();
  // The window every query shares: the first day of the month 11 months back.
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const starts: Record<RangeKey, Date> = {
    mtd: new Date(now.getFullYear(), now.getMonth(), 1),
    q: new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1),
    ytd: new Date(now.getFullYear(), 0, 1),
    "12m": windowStart,
  };
  const ranges: RangeDef[] = [
    { key: "mtd", label: "This month", note: dayNote(starts.mtd, now) },
    { key: "q", label: "Quarter", note: dayNote(starts.q, now) },
    { key: "ytd", label: "Year", note: dayNote(starts.ytd, now) },
    { key: "12m", label: "Last 12 months", note: monthNote(windowStart, now) },
  ];
  // Bucket counts: how many of the trailing 12 month columns each range spans.
  const rangeMonths: Record<RangeKey, number> = {
    mtd: 1,
    q: (now.getMonth() % 3) + 1,
    ytd: now.getMonth() + 1,
    "12m": 12,
  };

  const [invoices, payments, leads, proposals, jobs, workers, memberships] = await Promise.all([
    db.invoice.findMany({
      where: { organizationId, createdAt: { gte: windowStart } },
      select: { amount: true, createdAt: true },
    }),
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: windowStart } },
      select: { amount: true, paidAt: true },
    }),
    db.lead.findMany({
      where: { organizationId, createdAt: { gte: windowStart } },
      select: { createdAt: true },
    }),
    db.proposal.findMany({
      where: {
        organizationId,
        OR: [{ sentAt: { gte: windowStart } }, { acceptedAt: { gte: windowStart } }],
      },
      select: { sentAt: true, acceptedAt: true },
    }),
    // `Job` has no completedAt column; a job's move into COMPLETED is the last
    // thing that touches the row, so updatedAt is the completion timestamp.
    db.job.findMany({
      where: { organizationId, status: "COMPLETED", updatedAt: { gte: windowStart } },
      select: {
        id: true,
        updatedAt: true,
        assignments: { select: { workerId: true } },
        events: { select: { startsAt: true, endsAt: true } },
        reviewRequests: { where: { rating: { not: null } }, select: { rating: true } },
        proposal: {
          select: { payments: { where: { status: "PAID" }, select: { amount: true } } },
        },
      },
    }),
    db.workerProfile.findMany({
      where: { organizationId },
      select: { id: true, userId: true, displayName: true },
    }),
    db.membership.findMany({ where: { organizationId }, select: { userId: true, role: true } }),
  ]);

  // ── Revenue: invoiced against collected, by month ────────────────────────
  const buckets: MonthPoint[] = [];
  const byKey = new Map<string, MonthPoint>();
  for (let i = 0; i < 12; i++) {
    const d = new Date(windowStart.getFullYear(), windowStart.getMonth() + i, 1);
    const p: MonthPoint = { m: monthLabel(d), invoiced: 0, collected: 0 };
    buckets.push(p);
    byKey.set(monthKey(d), p);
  }
  for (const inv of invoices) {
    const b = byKey.get(monthKey(inv.createdAt));
    if (b) b.invoiced += inv.amount;
  }
  for (const p of payments) {
    if (!p.paidAt) continue;
    const b = byKey.get(monthKey(p.paidAt));
    if (b) b.collected += p.amount;
  }

  // ── Funnel + conversion, per range ───────────────────────────────────────
  const funnel = {} as Record<RangeKey, FunnelStep[]>;
  const avgDaysToClose = {} as Record<RangeKey, number | null>;
  const roleByUser = new Map(memberships.map((m) => [m.userId, m.role]));
  const crew = {} as Record<RangeKey, CrewMember[]>;

  for (const key of RANGE_KEYS) {
    const from = starts[key];
    const leadCount = leads.filter((l) => l.createdAt >= from).length;
    const quoted = proposals.filter((p) => p.sentAt && p.sentAt >= from);
    const accepted = proposals.filter((p) => p.acceptedAt && p.acceptedAt >= from);
    const rangeJobs = jobs.filter((j) => j.updatedAt >= from);
    funnel[key] = [
      ["Leads", leadCount],
      ["Quoted", quoted.length],
      ["Accepted", accepted.length],
      ["Completed", rangeJobs.length],
    ];

    const closed = accepted.filter((p) => p.sentAt && p.acceptedAt && p.acceptedAt >= p.sentAt);
    avgDaysToClose[key] = closed.length
      ? closed.reduce(
          (a, p) => a + (p.acceptedAt!.getTime() - p.sentAt!.getTime()) / 86_400_000,
          0,
        ) / closed.length
      : null;

    // ── Crew performance ──────────────────────────────────────────────────
    // Per assigned worker: jobs delivered, hours scheduled on those jobs, and
    // the collected money they were part of. Hours are NOT split — every
    // assignee was on site for the whole event — but revenue IS split evenly
    // across the job's crew, otherwise a two-person job would be counted twice.
    type Acc = { jobs: number; hours: number; revenue: number; rSum: number; rCount: number };
    const acc = new Map<string, Acc>();
    const bump = (id: string): Acc => {
      let a = acc.get(id);
      if (!a) {
        a = { jobs: 0, hours: 0, revenue: 0, rSum: 0, rCount: 0 };
        acc.set(id, a);
      }
      return a;
    };
    for (const j of rangeJobs) {
      const crewIds = j.assignments.map((a) => a.workerId);
      if (!crewIds.length) continue;
      const hours = j.events.reduce(
        (a, e) => a + Math.max(0, e.endsAt.getTime() - e.startsAt.getTime()) / 3_600_000,
        0,
      );
      const collected = (j.proposal?.payments ?? []).reduce((a, p) => a + p.amount, 0);
      const share = collected / crewIds.length;
      const ratings = j.reviewRequests
        .map((r) => r.rating)
        .filter((r): r is number => typeof r === "number");
      for (const id of crewIds) {
        const a = bump(id);
        a.jobs += 1;
        a.hours += hours;
        a.revenue += share;
        for (const r of ratings) {
          a.rSum += r;
          a.rCount += 1;
        }
      }
    }
    crew[key] = workers
      .filter((w) => acc.has(w.id))
      .map((w) => {
        const a = acc.get(w.id)!;
        return {
          name: w.displayName,
          role: roleLabel(roleByUser.get(w.userId)),
          jobs: a.jobs,
          hours: Math.round(a.hours),
          revenue: a.revenue,
          rating: a.rCount ? a.rSum / a.rCount : null,
        };
      })
      .sort((x, y) => y.revenue - x.revenue || y.jobs - x.jobs);
  }

  return { ranges, months: buckets, rangeMonths, funnel, crew, avgDaysToClose };
}
