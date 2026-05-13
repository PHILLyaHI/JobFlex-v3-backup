"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { RevenueSparkline } from "@/components/dashboard/RevenueSparkline";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import {
  MobilePipelineStrip,
  type PipelineLead,
} from "@/components/dashboard/MobilePipelineStrip";
import { money, longDate, shortDate } from "@/lib/format";

type BadgeTone = "neutral" | "accent" | "success" | "warn" | "danger";

interface ProposalRow {
  id: string;
  title: string;
  status: string;
  total: number;
  updatedAt: Date;
  client: { name: string } | null;
}

interface JobEventRow {
  id: string;
  title: string;
  startsAt: Date;
  notes: string | null;
}

interface ActivityRow {
  id: string;
  kind: string;
  summary: string;
  createdAt: Date;
}

interface MobileDashboardProps {
  greeting: string;
  todayLabel: string;
  totalRevenue: number;
  pipelineValue: number;
  openProposals: number;
  acceptedProposals: number;
  newLeadsCount: number;
  proposals: ProposalRow[];
  leads: PipelineLead[];
  activities: ActivityRow[];
  jobEvents: JobEventRow[];
  sparkData: { day: string; revenue: number }[];
}

function statusTone(s: string): BadgeTone {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  return "neutral";
}

export function MobileDashboard({
  greeting,
  todayLabel,
  totalRevenue,
  pipelineValue,
  openProposals,
  acceptedProposals,
  newLeadsCount,
  proposals,
  leads,
  activities,
  jobEvents,
  sparkData,
}: MobileDashboardProps) {
  return (
    <div className="px-5 -mx-6 -my-8 pt-safe pb-6 space-y-7">
      <header className="px-5">
        <div className="quiet-caps">Good {greeting} &middot; {todayLabel}</div>
        <h1 className="font-display text-[26px] tracking-[-0.02em] leading-tight mt-1">
          Overview
        </h1>
        <p className="mt-1.5 text-[12px] text-[color:var(--ink-muted)] max-w-[42ch]">
          Revenue, pipeline, and what to do next. Today, at a glance.
        </p>
      </header>

      <section>
        <div className="px-5 quiet-caps mb-2">Today</div>
        <div className="overflow-x-auto snap-x snap-mandatory">
          <ul className="flex gap-2.5 px-5 pb-1">
            <StatTile
              label="Revenue · 30d"
              value={money(totalRevenue)}
              hint="Collected across all providers"
            />
            <StatTile
              label="Pipeline value"
              value={money(pipelineValue)}
              hint={`${proposals.length} active proposals`}
            />
            <StatTile
              label="Open proposals"
              value={String(openProposals)}
              hint={`${acceptedProposals} won`}
            />
            <StatTile
              label="New leads · 7d"
              value={String(newLeadsCount)}
              hint="AI-categorized, ready to triage"
            />
          </ul>
        </div>
      </section>

      <section className="px-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="quiet-caps">Revenue</div>
            <h2 className="font-display text-[18px] tracking-[-0.01em]">Paid invoices &middot; 30 days</h2>
          </div>
          <Link
            href={"/dashboard/reports" as never}
            className="text-[11px] text-[color:var(--ink-muted)] inline-flex items-center gap-1"
          >
            Reports <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="paper-card p-3">
          <RevenueSparkline data={sparkData} />
        </div>
      </section>

      <section className="px-5">
        <div className="quiet-caps mb-3">Activity</div>
        <ActivityFeed items={activities} />
      </section>

      <section>
        <div className="px-5 flex items-baseline justify-between mb-3">
          <div>
            <div className="quiet-caps">Pipeline</div>
            <h2 className="font-display text-[18px] tracking-[-0.01em]">Lead flow</h2>
          </div>
          <Link
            href={"/dashboard/leads" as never}
            className="text-[11px] text-[color:var(--ink-muted)] inline-flex items-center gap-1"
          >
            All leads <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <MobilePipelineStrip leads={leads} />
      </section>

      <section className="px-5">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <div className="quiet-caps">Sales</div>
            <h2 className="font-display text-[18px] tracking-[-0.01em]">Latest proposals</h2>
          </div>
          <Link
            href={"/dashboard/proposals" as never}
            className="text-[11px] text-[color:var(--ink-muted)] inline-flex items-center gap-1"
          >
            All <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        {proposals.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">
            No proposals yet. Draft your first one from the &lsquo;+&rsquo; below.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {proposals.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/proposals/${p.id}` as never}
                  className="flex items-center justify-between gap-3 py-3 hover:bg-black/[0.02] -mx-1 px-1 rounded-[var(--r-sm)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                      {p.title}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] truncate mt-0.5">
                      {p.client?.name ?? "Unassigned"} &middot; {shortDate(p.updatedAt)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    <span className="font-display tabular text-[14px]">
                      {money(p.total)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="px-5">
        <div className="quiet-caps mb-3">Schedule</div>
        <h2 className="font-display text-[18px] tracking-[-0.01em] mb-3">Upcoming jobs</h2>
        {jobEvents.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">Your calendar is clear.</p>
        ) : (
          <ul className="space-y-3">
            {jobEvents.map((j) => (
              <li key={j.id} className="flex gap-3 items-start">
                <div className="h-12 w-12 shrink-0 rounded-[var(--r-sm)] bg-[color:var(--accent-soft)] text-[color:var(--accent-ink)] grid place-items-center font-display text-[15px] tabular">
                  {shortDate(j.startsAt).split(" ")[1]}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                    {j.title}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                    {longDate(j.startsAt)} &middot; {j.notes ?? "scheduled"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <li className="snap-start shrink-0 paper-card w-[240px] px-4 py-4">
      <div className="quiet-caps !mb-1.5">{label}</div>
      <div className="font-display tabular text-[28px] leading-none tracking-[-0.02em]">
        {value}
      </div>
      <div className="text-[11px] text-[color:var(--ink-muted)] mt-2">{hint}</div>
    </li>
  );
}
