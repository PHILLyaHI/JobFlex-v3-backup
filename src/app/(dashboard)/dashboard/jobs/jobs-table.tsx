"use client";
import * as React from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { JobStatusBadge } from "@/components/jobs/JobStatusBadge";
import { shortDate, relative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Pagination } from "@/components/ui/Pagination";
import { usePagedList } from "@/lib/usePagedList";

export type JobRow = {
  id: string;
  title: string;
  status: string;
  clientName: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  crewCount: number;
  notes: string | null;
};

const STATUS_TABS = [
  { key: "ALL", label: "All" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "IN_PROGRESS", label: "In progress" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELED", label: "Canceled" },
];

export function JobsTable({ rows }: { rows: JobRow[] }) {
  const [tab, setTab] = React.useState<string>("ALL");
  const filtered = React.useMemo(
    () => (tab === "ALL" ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );
  const { page, pageCount, setPage, pageItems } = usePagedList(filtered, 20);

  const columns: Column<JobRow>[] = [
    {
      key: "title",
      header: "Job",
      render: (r) => (
        <Link href={`/dashboard/jobs/${r.id}` as any} className="block">
          <div className="font-medium text-[color:var(--ink)]">{r.title}</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
            {r.clientName ?? "No client"}
          </div>
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <JobStatusBadge status={r.status} />,
    },
    {
      key: "schedule",
      header: "Schedule",
      render: (r) =>
        r.startsAt ? (
          <div>
            <div className="text-[color:var(--ink-soft)] tabular">{shortDate(r.startsAt)}</div>
            <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
              {relative(r.startsAt)}
            </div>
          </div>
        ) : (
          <span className="text-[color:var(--ink-faint)]">Unscheduled</span>
        ),
    },
    {
      key: "crew",
      header: "Crew",
      align: "right",
      render: (r) => <span className="tabular text-[color:var(--ink-muted)]">{r.crewCount}</span>,
    },
  ];

  return (
    <>
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {STATUS_TABS.map((t) => {
          const count = t.key === "ALL" ? rows.length : rows.filter((r) => r.status === t.key).length;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] hairline transition-colors inline-flex items-center gap-2",
                tab === t.key
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)] border-transparent"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "tabular",
                  tab === t.key ? "text-[color:var(--paper)]/70" : "text-[color:var(--ink-faint)]",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <DataTable columns={columns} rows={pageItems} rowKey={(r) => r.id} />
      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
    </>
  );
}
