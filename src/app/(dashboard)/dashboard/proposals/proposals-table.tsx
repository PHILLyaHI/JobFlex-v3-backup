"use client";
import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { money, relative } from "@/lib/format";

export type ProposalRow = {
  id: string;
  title: string;
  status: string;
  total: number;
  clientName: string;
  updatedAt: Date;
  viewCount: number;
};

export function ProposalsTable({ rows }: { rows: ProposalRow[] }) {
  const columns: Column<ProposalRow>[] = [
    {
      key: "title",
      header: "Proposal",
      render: (r) => (
        <Link href={`/dashboard/proposals/${r.id}` as any} className="block">
          <div className="font-medium text-[color:var(--ink)]">{r.title}</div>
          <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">{r.clientName}</div>
        </Link>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={toneFor(r.status)}>{r.status}</Badge>,
    },
    {
      key: "views",
      header: "Views",
      align: "right",
      render: (r) => <span className="tabular text-[color:var(--ink-muted)]">{r.viewCount}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      render: (r) => <span className="text-[color:var(--ink-muted)]">{relative(r.updatedAt)}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (r) => (
        <span className="font-display text-[15px] tabular text-[color:var(--ink)]">
          {money(r.total)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      footer={`${rows.length} proposal${rows.length === 1 ? "" : "s"} · ${money(rows.reduce((a, r) => a + r.total, 0))} pipeline`}
    />
  );
}

function toneFor(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  return "neutral";
}
