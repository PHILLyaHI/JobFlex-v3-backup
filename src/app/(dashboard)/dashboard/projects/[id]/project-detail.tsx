"use client";
import * as React from "react";
import Link from "next/link";
import { Plus, List, Calendar, BarChart3, Briefcase } from "lucide-react";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
import { money, shortDate } from "@/lib/format";
import { GanttChart, type GanttJob } from "@/components/projects/GanttChart";
import { AssignJobDrawer } from "@/components/projects/AssignJobDrawer";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";

interface JobItem {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  clientName: string | null;
}

interface AvailableJob {
  id: string;
  title: string;
  status: string;
  startsAt: Date | null;
  clientName: string | null;
}

interface Props {
  project: {
    id: string;
    name: string;
    description: string | null;
    status: string;
    startsAt: Date | null;
    endsAt: Date | null;
    budget: number;
  };
  jobs: JobItem[];
  availableJobs: AvailableJob[];
}

type View = "list" | "calendar" | "gantt";

export function ProjectDetail({ project, jobs, availableJobs }: Props) {
  const [view, setView] = React.useState<View>("list");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const totalJobs = jobs.length;
  const completed = jobs.filter((j) => j.status === "COMPLETED").length;
  const inProgress = jobs.filter((j) => j.status === "IN_PROGRESS").length;
  const scheduled = jobs.filter((j) => j.status === "SCHEDULED").length;

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Jobs" value={String(totalJobs)} hint={`${completed} done`} />
        <Stat label="Scheduled" value={String(scheduled)} hint="awaiting start" />
        <Stat label="In progress" value={String(inProgress)} hint="active right now" />
        <Stat
          label="Budget"
          value={money(project.budget)}
          hint={
            project.startsAt && project.endsAt
              ? `${shortDate(project.startsAt)} → ${shortDate(project.endsAt)}`
              : "no window set"
          }
        />
      </div>

      {/* View switcher */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="inline-flex items-center gap-1 paper-card !p-1">
          <ViewBtn icon={<List className="h-3.5 w-3.5" />} label="List" active={view === "list"} onClick={() => setView("list")} />
          <ViewBtn icon={<Calendar className="h-3.5 w-3.5" />} label="Calendar" active={view === "calendar"} onClick={() => setView("calendar")} />
          <ViewBtn icon={<BarChart3 className="h-3.5 w-3.5" />} label="Gantt" active={view === "gantt"} onClick={() => setView("gantt")} />
        </div>
        <Button
          variant="outline"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setDrawerOpen(true)}
        >
          Attach job
        </Button>
      </div>

      {view === "list" && <ListView jobs={jobs} />}
      {view === "calendar" && <CalendarView jobs={jobs} />}
      {view === "gantt" && (
        <GanttChart
          jobs={jobs.map<GanttJob>((j) => ({
            id: j.id,
            title: j.title,
            status: j.status,
            startsAt: j.startsAt,
            endsAt: j.endsAt,
          }))}
          windowStart={project.startsAt ?? undefined}
          windowEnd={project.endsAt ?? undefined}
        />
      )}

      <AssignJobDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        projectId={project.id}
        availableJobs={availableJobs}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="paper-card p-4">
      <div className="quiet-caps">{label}</div>
      <div className="font-display tabular text-[24px] leading-none mt-1.5 tracking-[-0.015em]">
        {value}
      </div>
      <div className="text-[10.5px] text-[color:var(--ink-muted)] mt-2 tabular">{hint}</div>
    </div>
  );
}

function ViewBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11.5px] font-medium transition-all",
        active
          ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
          : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ListView({ jobs }: { jobs: JobItem[] }) {
  if (jobs.length === 0) {
    return (
      <Card>
        <div className="py-10 text-center">
          <Briefcase className="h-6 w-6 text-[color:var(--ink-faint)] mx-auto mb-3" />
          <div className="font-medium text-[color:var(--ink)]">No jobs attached yet</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
            Click "Attach job" to bring existing jobs under this project.
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Jobs</CardTitle>
          <CardSubtitle>{jobs.length} attached</CardSubtitle>
        </div>
      </CardHeader>
      <ul className="divide-y divide-[color:var(--ink-line)]">
        {jobs.map((j) => (
          <li key={j.id} className="py-3.5">
            <Link
              href={`/dashboard/jobs/${j.id}` as any}
              className="flex items-center justify-between gap-3 hover:bg-black/[0.012] -mx-3 px-3 py-1 rounded-[var(--r-sm)] transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-[color:var(--ink)] truncate">{j.title}</div>
                <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                  {j.clientName ?? "Unassigned"}
                  {j.startsAt && ` · ${shortDate(j.startsAt)}`}
                  {j.endsAt && ` → ${shortDate(j.endsAt)}`}
                </div>
              </div>
              <JobStatusBadge status={j.status} />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CalendarView({ jobs }: { jobs: JobItem[] }) {
  const monthCells = buildMonthCells(jobs);
  return (
    <Card>
      <div className="grid grid-cols-7 gap-1.5">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="quiet-caps text-center !mb-0">
            {d}
          </div>
        ))}
        {monthCells.map((c, i) => (
          <div
            key={i}
            className={cn(
              "min-h-[72px] paper-card !shadow-none p-1.5 text-[10px] tabular",
              !c.inMonth && "opacity-40",
            )}
          >
            <div className="text-[color:var(--ink-muted)]">{c.day}</div>
            <div className="space-y-0.5 mt-1">
              {c.jobs.slice(0, 2).map((j) => (
                <Link
                  key={j.id}
                  href={`/dashboard/jobs/${j.id}` as any}
                  className="block truncate text-[10px] text-[color:var(--ink)] hover:text-[color:var(--accent)]"
                >
                  {j.title}
                </Link>
              ))}
              {c.jobs.length > 2 && (
                <div className="text-[9px] text-[color:var(--ink-muted)]">
                  +{c.jobs.length - 2} more
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function buildMonthCells(jobs: JobItem[]) {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - ((first.getDay() + 6) % 7)); // Monday-first
  const cells: { day: number; inMonth: boolean; jobs: JobItem[] }[] = [];
  for (let i = 0; i < 35; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const inMonth = d.getMonth() === today.getMonth();
    const dayJobs = jobs.filter((j) => {
      if (!j.startsAt || !j.endsAt) return false;
      return j.startsAt <= d && j.endsAt >= d;
    });
    cells.push({ day: d.getDate(), inMonth, jobs: dayJobs });
  }
  return cells;
}
