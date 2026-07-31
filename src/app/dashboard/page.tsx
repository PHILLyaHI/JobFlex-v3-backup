// Main dashboard — Blueprint edition. Pixel-identical port of the canonical
// donor (.claude/skills/jobflex-page-styler/assets/jobflex-dashboard-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ./layout.tsx, so this page renders only the donor's `.content` children —
// navigating between blueprint pages swaps the content and leaves the chrome
// standing.
//
// This page is NOT a fixture. Every region on the sheet — the KPI strip, the
// revenue chart's three ranges, Recent Activity, This Week, Upcoming Jobs and
// the Lead Flow board — is read here from the database and handed to the
// behavior module, and the board's drag persists through `updateLeadStatus`.
// The queries are the archived classic overview's (git a8bd532^:
// src/app/(dashboard)/dashboard/page.tsx): same 30/60/90-day revenue windows,
// same ACTIVE_PIPELINE definition, same week window, same lead slice — so both
// editions describe the same business.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, isSalesRole, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { money, relative } from "@/lib/format";
import { parseTradeTypes } from "@/lib/tradeTypes";
import { DashboardContent } from "@/components/v3/dashboard-blueprint/dashboard-content";
import {
  BOARD_STATUSES,
  activityIcon,
  activityLabel,
  makeDataset,
  type ActivityRow,
  type BoardLead,
  type DashboardData,
  type JobRow,
  type WeekDay,
  type WeekEvent,
} from "@/components/v3/dashboard-blueprint/blueprint-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Overview",
  description:
    "The JobFlex operations overview — proposals, revenue, schedule and lead flow on one sheet.",
};

/** Local calendar day key. `toISOString()` would shift the boundary by the UTC
 *  offset and file an 8pm job under tomorrow. */
function dayKey(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const TIME_FMT = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "short" });
const WEEKDAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const PLATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" });
const TICK_FMT = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" });

/** The donor's "SU / MO / TU" strip labels. */
function dayLabel(d: Date): string {
  return WEEKDAY_FMT.format(d).slice(0, 2).toUpperCase();
}

/** The donor's "JUL 28" date plate. */
function datePlate(d: Date): string {
  return PLATE_FMT.format(d).toUpperCase();
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  return h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
}

/** "Bothell, WA" — either half may be missing on a real row. */
function placeLabel(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(", ") || "—";
}

/**
 * Sum PAID payments into consecutive buckets. One 90-day read feeds all three
 * chart ranges, so switching the dropdown never hits the database.
 */
function bucketSums(
  payments: { amount: number; paidAt: Date | null }[],
  edges: Date[],
): number[] {
  const out = new Array(Math.max(0, edges.length - 1)).fill(0) as number[];
  for (const p of payments) {
    if (!p.paidAt) continue;
    const t = p.paidAt.getTime();
    for (let i = 0; i < out.length; i++) {
      if (t >= edges[i].getTime() && t < edges[i + 1].getTime()) {
        out[i] += p.amount;
        break;
      }
    }
  }
  return out;
}

/** `count` buckets of `span` days each, ending at the end of today. */
function buildRange(
  payments: { amount: number; paidAt: Date | null }[],
  today: Date,
  count: number,
  span: number,
  label: (bucketEnd: Date) => string,
) {
  const end = addDays(startOfDay(today), 1); // exclusive: tomorrow 00:00
  const edges: Date[] = [];
  for (let i = count; i >= 0; i--) edges.push(addDays(end, -i * span));
  const values = bucketSums(payments, edges);
  // The label names the LAST day inside the bucket, so it never reads as a day
  // that has not happened yet.
  const labels = edges.slice(1).map((e) => label(addDays(e, -1)));
  return makeDataset(labels, values);
}

export default async function DashboardPage() {
  let organizationId: string;
  let role: string;
  let userId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
    userId = ctx.user.id;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const now = new Date();
  const today = startOfDay(now);
  const thirtyDaysAgo = addDays(now, -30);
  const ninetyDaysAgo = addDays(today, -90);
  const sevenDaysAgo = addDays(now, -7);

  // Current week, Sunday 00:00 → next Sunday 00:00 (the calendar's Sunday-first
  // convention, same as the classic overview's This Week card).
  const weekStart = addDays(today, -today.getDay());
  const weekEnd = addDays(weekStart, 7);

  const ACTIVE_PIPELINE = { notIn: ["DECLINED", "ARCHIVED", "EXPIRED"] };

  const [
    leadProfileOrg,
    paymentsLast90,
    pipelineAgg,
    openProposals,
    newLeads7,
    activityRows,
    upcomingRows,
    weekRows,
    leadRows,
  ] = await Promise.all([
    // Owners/admins see the Lead Center nudge until the org is matchable
    // (geocoded address + at least one trade). Everyone else never sees it.
    role === "OWNER" || role === "ADMIN"
      ? db.organization.findUnique({
          where: { id: organizationId },
          select: { lat: true, lng: true, tradeTypesJson: true },
        })
      : Promise.resolve(null),
    db.payment.findMany({
      where: { organizationId, status: "PAID", paidAt: { gte: ninetyDaysAgo } },
      orderBy: { paidAt: "asc" },
      select: { amount: true, paidAt: true },
    }),
    db.proposal.aggregate({
      where: { organizationId, status: ACTIVE_PIPELINE },
      _sum: { total: true },
    }),
    db.proposal.count({
      where: { organizationId, status: { in: ["DRAFT", "SENT", "VIEWED"] } },
    }),
    db.lead.count({ where: { organizationId, createdAt: { gte: sevenDaysAgo } } }),
    db.activityEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      // The donor's Recent Activity card shows at most ten rows.
      take: 10,
      select: { id: true, kind: true, summary: true, createdAt: true },
    }),
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 12,
      select: {
        id: true,
        title: true,
        startsAt: true,
        notes: true,
        job: {
          select: {
            id: true,
            client: { select: { name: true } },
            assignments: { select: { status: true } },
          },
        },
      },
    }),
    db.jobEvent.findMany({
      where: { organizationId, startsAt: { gte: weekStart, lt: weekEnd } },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true, startsAt: true },
    }),
    // Sales reps only see leads assigned to them, claimed by them, or still NEW
    // in the shared pool — the same slice the leads page and `updateLeadStatus`
    // enforce, so a card on this board is always a card they may move.
    db.lead.findMany({
      where: {
        organizationId,
        status: { in: [...BOARD_STATUSES] },
        ...(isSalesRole(role)
          ? { OR: [{ assignedToId: userId }, { claimedById: userId }, { status: "NEW" }] }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        projectType: true,
        status: true,
        createdAt: true,
        assignedTo: { select: { name: true, email: true } },
      },
    }),
  ]);

  // ── KPI strip ─────────────────────────────────────────────────────────────
  const revenue30 = paymentsLast90
    .filter((p) => p.paidAt && p.paidAt >= thirtyDaysAgo)
    .reduce((acc, p) => acc + p.amount, 0);

  // ── Revenue trend ─────────────────────────────────────────────────────────
  // One 90-day read, three views of it: seven days, ten three-day buckets,
  // thirteen weeks — the donor's own point counts for each range.
  const chart = {
    "7d": buildRange(paymentsLast90, now, 7, 1, (d) => WEEKDAY_FMT.format(d).toUpperCase()),
    "30d": buildRange(paymentsLast90, now, 10, 3, (d) => TICK_FMT.format(d)),
    "90d": buildRange(paymentsLast90, now, 13, 7, (d) => TICK_FMT.format(d)),
  };

  // ── Recent activity ───────────────────────────────────────────────────────
  const activities: ActivityRow[] = activityRows.map((a) => ({
    i: activityIcon(a.kind),
    t: a.summary,
    m: activityLabel(a.kind) + " · " + relative(a.createdAt),
  }));

  // ── This week ─────────────────────────────────────────────────────────────
  const weekEventsByDay: Record<string, WeekEvent[]> = {};
  for (const e of weekRows) {
    const key = dayKey(e.startsAt);
    (weekEventsByDay[key] ??= []).push({
      m: e.startsAt.getHours() * 60 + e.startsAt.getMinutes(),
      t: TIME_FMT.format(e.startsAt),
      title: e.title,
    });
  }
  const todayIso = dayKey(today);
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    const iso = dayKey(d);
    return {
      iso,
      num: d.getDate(),
      lbl: dayLabel(d),
      today: iso === todayIso,
      has: (weekEventsByDay[iso]?.length ?? 0) > 0,
    };
  });
  const lastDay = addDays(weekStart, 6);
  const weekRange =
    MONTH_FMT.format(weekStart) +
    " " +
    weekStart.getDate() +
    " – " +
    (weekStart.getMonth() === lastDay.getMonth() ? "" : MONTH_FMT.format(lastDay) + " ") +
    lastDay.getDate();

  // ── Upcoming jobs ─────────────────────────────────────────────────────────
  // The donor's chip is two-state. "Confirmed" is a job whose crew have all
  // accepted their assignment; anything else — nobody staffed yet, an
  // outstanding invite, or a calendar hold with no job behind it — is "Pending".
  const jobs: JobRow[] = upcomingRows.map((e) => {
    const asg = e.job?.assignments ?? [];
    const confirmed =
      asg.length > 0 && asg.every((a) => a.status === "ACCEPTED" || a.status === "COMPLETED");
    return {
      id: e.id,
      date: datePlate(e.startsAt),
      title: e.title,
      sub: TIME_FMT.format(e.startsAt) + " · " + (e.job?.client?.name ?? e.notes ?? "Scheduled"),
      st: confirmed ? "ok" : "wait",
      today: dayKey(e.startsAt) === todayIso,
    };
  });

  // ── Lead flow ─────────────────────────────────────────────────────────────
  const leads: BoardLead[] = leadRows.map((l) => ({
    id: l.id,
    stage: l.status.toLowerCase(),
    name: l.name,
    job: l.projectType ?? "General inquiry",
    city: placeLabel(l.city, l.state),
    owner: l.assignedTo?.name ?? l.assignedTo?.email ?? null,
    age: relative(l.createdAt),
  }));

  const needsAddress = leadProfileOrg != null && (leadProfileOrg.lat == null || leadProfileOrg.lng == null);
  const needsTrades =
    leadProfileOrg != null && parseTradeTypes(leadProfileOrg.tradeTypesJson).length === 0;

  const data: DashboardData = {
    greeting: "Good " + greetingFor(now) + " · " + MONTH_FMT.format(now) + " " + now.getDate(),
    leadProfile: needsAddress || needsTrades ? { needsAddress, needsTrades } : null,
    kpis: {
      revenue: money(revenue30),
      pipeline: money(pipelineAgg._sum.total ?? 0),
      openProposals: String(openProposals),
      newLeads: String(newLeads7),
    },
    chart,
    activities,
    week: {
      range: weekRange,
      scheduled: weekRows.length,
      days,
      events: weekEventsByDay,
      todayIso,
    },
    jobs,
    leads,
  };

  return <DashboardContent data={data} />;
}
