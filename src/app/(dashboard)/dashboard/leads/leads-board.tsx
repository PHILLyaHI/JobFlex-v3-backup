"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { useLeadFilterStore } from "@/stores/useLeadFilterStore";
import { relative } from "@/lib/format";

interface LeadRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  projectType: string | null;
  description: string | null;
  status: string;
  aiCategory: string | null;
  aiConfidence: number | null;
  createdAt: Date;
  assignee: string | null;
}

const STATUSES = ["ALL", "NEW", "CONTACTED", "QUOTED", "WON", "LOST", "ARCHIVED"] as const;

export function LeadsBoard({ leads }: { leads: LeadRow[] }) {
  const query = useLeadFilterStore((s) => s.query);
  const setQuery = useLeadFilterStore((s) => s.setQuery);
  const status = useLeadFilterStore((s) => s.status);
  const setStatus = useLeadFilterStore((s) => s.setStatus);

  const filtered = React.useMemo(() => {
    return leads.filter((l) => {
      if (status !== "ALL" && l.status !== status) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        l.name.toLowerCase().includes(q) ||
        (l.email ?? "").toLowerCase().includes(q) ||
        (l.projectType ?? "").toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [leads, query, status]);

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
          {r.aiCategory && (
            <div className="mt-1 flex items-center gap-1.5 text-[10px]">
              <span className="italic font-display text-[color:var(--ink-muted)]">AI suggests</span>
              <Badge tone="accent">
                {r.aiCategory}
                {r.aiConfidence && r.aiConfidence > 0 && (
                  <span className="ml-1 tabular opacity-60">{Math.round(r.aiConfidence * 100)}%</span>
                )}
              </Badge>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <Badge tone={toneFor(r.status)}>{r.status}</Badge>,
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
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                "text-[11px] rounded-full px-3 py-1 hairline transition-colors " +
                (status === s
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "text-[color:var(--ink-muted)] hover:bg-black/[0.04]")
              }
            >
              {s}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[11px] text-[color:var(--ink-muted)] tabular">
          {filtered.length} / {leads.length} leads
        </div>
      </div>
      <DataTable columns={columns} rows={filtered} rowKey={(r) => r.id} />
    </>
  );
}

function toneFor(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "NEW") return "accent";
  if (s === "WON") return "success";
  if (s === "LOST" || s === "ARCHIVED") return "danger";
  if (s === "CONTACTED" || s === "QUOTED") return "warn";
  return "neutral";
}
