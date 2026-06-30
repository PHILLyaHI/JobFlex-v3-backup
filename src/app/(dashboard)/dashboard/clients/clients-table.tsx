"use client";
import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Pagination } from "@/components/ui/Pagination";
import { usePagedList } from "@/lib/usePagedList";
import { money, shortDate } from "@/lib/format";

export type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  address: string | null;
  proposalCount: number;
  pipelineValue: number;
  tags: { label: string; color: string }[];
  vip: boolean;
  updated: Date;
};

export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const { page, pageCount, setPage, pageItems } = usePagedList(rows, 20);

  const columns: Column<ClientRow>[] = [
    {
      key: "name",
      header: "Client",
      render: (r) => (
        <Link
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          href={`/dashboard/clients/${r.id}` as any}
          className="flex items-center gap-3"
        >
          <Avatar name={r.name} size={34} />
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-[color:var(--ink)]">{r.name}</span>
              {r.vip && <Badge tone="accent">VIP</Badge>}
            </div>
            <div className="text-[11px] text-[color:var(--ink-muted)]">{r.email ?? "—"}</div>
          </div>
        </Link>
      ),
    },
    {
      key: "location",
      header: "Location",
      render: (r) => <span className="text-[color:var(--ink-muted)]">{r.address ?? "—"}</span>,
    },
    {
      key: "tags",
      header: "Tags",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.tags.map((t) => (
            <Badge key={t.label} tone="accent">
              {t.label}
            </Badge>
          ))}
          {r.tags.length === 0 && <span className="text-[color:var(--ink-faint)]">—</span>}
        </div>
      ),
    },
    {
      key: "proposals",
      header: "Proposals",
      align: "right",
      render: (r) => <span className="tabular">{r.proposalCount}</span>,
    },
    {
      key: "pipeline",
      header: "Pipeline",
      align: "right",
      render: (r) => <span className="font-display tabular text-[15px]">{money(r.pipelineValue)}</span>,
    },
    {
      key: "updated",
      header: "Updated",
      render: (r) => <span className="text-[color:var(--ink-muted)]">{shortDate(r.updated)}</span>,
    },
  ];

  return (
    <>
      <DataTable columns={columns} rows={pageItems} rowKey={(r) => r.id} />
      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
    </>
  );
}
