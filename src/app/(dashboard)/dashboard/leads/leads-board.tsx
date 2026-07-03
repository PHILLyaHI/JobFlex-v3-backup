"use client";
import * as React from "react";
import { Search, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { usePagedList } from "@/lib/usePagedList";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { useLeadFilterStore } from "@/stores/useLeadFilterStore";
import { relative } from "@/lib/format";
import { type LeadRow, statusTone, sourceLabel } from "./leads-shared";
import { LeadsFilter } from "./leads-filter";

export function LeadsBoard({
  leads,
  onDelete,
}: {
  leads: LeadRow[];
  onDelete: (id: string) => void | Promise<void>;
}) {
  const query = useLeadFilterStore((s) => s.query);
  const setQuery = useLeadFilterStore((s) => s.setQuery);
  const status = useLeadFilterStore((s) => s.status);
  const source = useLeadFilterStore((s) => s.source);
  const specialty = useLeadFilterStore((s) => s.specialty);

  // Distinct sources / specialties present, so the filter popover only offers real options.
  const sources = React.useMemo(
    () => Array.from(new Set(leads.map((l) => l.source).filter(Boolean) as string[])).sort(),
    [leads],
  );
  const specialties = React.useMemo(
    () => Array.from(new Set(leads.map((l) => l.aiCategory).filter(Boolean) as string[])).sort(),
    [leads],
  );

  const filtered = React.useMemo(() => {
    return leads.filter((l) => {
      if (status !== "ALL" && l.status !== status) return false;
      if (source && l.source !== source) return false;
      if (specialty && l.aiCategory !== specialty) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        l.name.toLowerCase().includes(q) ||
        (l.email ?? "").toLowerCase().includes(q) ||
        (l.projectType ?? "").toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, query, status, source, specialty]);

  const { page, pageCount, setPage, pageItems } = usePagedList(filtered, 20);

  const [pending, setPending] = React.useState<LeadRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      await onDelete(pending.id);
      setPending(null);
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<LeadRow>[] = [
    {
      key: "lead",
      header: "Lead",
      render: (r) => (
        <div className="flex items-center gap-3 min-w-0">
          <Avatar name={r.name} size={32} />
          <div className="min-w-0">
            <div className="font-medium text-[color:var(--ink)] truncate">{r.name}</div>
            <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
              {r.email ?? r.phone ?? "—"}
              {r.source && (
                <>
                  <span className="mx-1.5 text-[color:var(--ink-faint)]">·</span>
                  {sourceLabel(r.source)}
                </>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "project",
      header: "Project",
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[color:var(--ink-soft)] truncate">{r.projectType ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={statusTone(r.status)}>{r.status}</Badge>,
    },
    {
      key: "assignee",
      header: "Assigned",
      render: (r) => (
        <span className="text-[color:var(--ink-muted)]">{r.assignee ?? "—"}</span>
      ),
    },
    {
      key: "age",
      header: "Age",
      align: "right",
      render: (r) => <span className="text-[color:var(--ink-muted)]">{relative(r.createdAt)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={() => setPending(r)}
          aria-label={`Delete ${r.name}`}
          className="grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-faint)] transition-colors hover:bg-[color:var(--paper-deep)] hover:text-[color:var(--rose)]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="w-full md:w-auto md:min-w-[320px]">
          <Input
            placeholder="Search leads by name, email, or keyword…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            prefix={<Search className="h-3.5 w-3.5" />}
          />
        </div>
        <LeadsFilter sources={sources} specialties={specialties} />
        <div className="ml-auto text-[11px] text-[color:var(--ink-muted)] tabular">
          {filtered.length} / {leads.length} leads
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={pageItems}
        rowKey={(r) => r.id}
        empty={
          <div className="paper-card px-6 py-16 text-center text-[13px] text-[color:var(--ink-muted)]">
            No leads match these filters.
          </div>
        }
      />
      <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      <Dialog
        open={!!pending}
        onClose={() => {
          if (!deleting) setPending(null);
        }}
        title="Delete lead?"
        description={
          pending
            ? `${pending.name} will be permanently removed. This can't be undone.`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="danger" loading={deleting} onClick={confirmDelete}>
              Delete lead
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-[color:var(--ink-soft)]">
          Related activity, calls, and appointments are kept but no longer linked to this lead.
        </p>
      </Dialog>
    </>
  );
}
