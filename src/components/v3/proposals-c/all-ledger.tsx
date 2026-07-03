"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { RowActions } from "@/components/proposal/RowActions";
import { money, relative } from "@/lib/format";
import { Pagination } from "@/components/ui/Pagination";
import { usePagedList } from "@/lib/usePagedList";
import type { ProposalCRow, StatusSubFilter } from "./types";

interface AllLedgerProps {
  rows: ProposalCRow[];
  statusFilter: StatusSubFilter;
  onStatusFilterChange: (next: StatusSubFilter) => void;
}

const STATUS_CHIPS: { key: StatusSubFilter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "SENT", label: "Sent" },
  { key: "DECLINED", label: "Declined" },
  { key: "EXPIRED", label: "Expired" },
];

export function AllLedger({ rows, statusFilter, onStatusFilterChange }: AllLedgerProps) {
  const counts = React.useMemo(() => {
    const c: Record<StatusSubFilter, number> = {
      ALL: rows.length,
      DRAFT: 0,
      SENT: 0,
      VIEWED: 0,
      DECLINED: 0,
      EXPIRED: 0,
    };
    for (const r of rows) {
      if (r.status === "DRAFT") c.DRAFT++;
      else if (r.status === "SENT") c.SENT++;
      else if (r.status === "VIEWED") c.VIEWED++;
      else if (r.status === "DECLINED") c.DECLINED++;
      else if (r.status === "EXPIRED") c.EXPIRED++;
    }
    return c;
  }, [rows]);

  const filtered = React.useMemo(() => {
    if (statusFilter === "ALL") return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  const { page, pageCount, setPage, pageItems, offset } = usePagedList(filtered, 20);

  return (
    <div className="pt-8">
      {/* Status sub-filters — only present on the All tab */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <span className="quiet-caps text-[color:var(--ink-faint)] mr-1">Status</span>
        {STATUS_CHIPS.map((c) => {
          const isActive = statusFilter === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onStatusFilterChange(c.key)}
              className={cn(
                "h-7 px-3 rounded-full text-[12px] font-medium tracking-[-0.005em]",
                "transition-colors duration-150 focus-ring",
                isActive
                  ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
                  : "text-[color:var(--ink-muted)] hairline hover:text-[color:var(--ink)] hover:bg-black/[0.025]",
              )}
            >
              <span>{c.label}</span>
              <span
                className={cn(
                  "tabular ml-1.5 text-[11px]",
                  isActive ? "text-[color:var(--paper)]/70" : "text-[color:var(--ink-faint)]",
                )}
              >
                {counts[c.key]}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyLedger filter={statusFilter} />
      ) : (
        <div className="paper-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[color:var(--ink-line)]">
                  <th className="quiet-caps w-[60px] px-5 py-3 text-left text-[color:var(--ink-faint)]">
                    No.
                  </th>
                  <th className="quiet-caps px-5 py-3 text-left">Proposal</th>
                  <th className="quiet-caps px-5 py-3 text-left w-[180px]">Created by</th>
                  <th className="quiet-caps px-5 py-3 text-left w-[120px]">Status</th>
                  <th className="quiet-caps px-5 py-3 text-right w-[80px]">Views</th>
                  <th className="quiet-caps px-5 py-3 text-left w-[120px]">Updated</th>
                  <th className="quiet-caps px-5 py-3 text-right w-[150px]">Total</th>
                  <th className="w-[56px] px-3 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <motion.tbody initial="initial" animate="animate">
                {pageItems.map((r, i) => (
                  <motion.tr
                    key={r.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: Math.min(i * 0.015, 0.18), ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      "group border-b border-[color:var(--ink-line)] last:border-0",
                      "transition-colors hover:bg-[color:var(--paper-deep)]/40",
                    )}
                  >
                    <td className="px-5 py-3.5 align-middle">
                      <span className="font-mono tabular text-[11px] text-[color:var(--ink-faint)]">
                        {String(filtered.length - offset - i).padStart(3, "0")}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        href={`/dashboard/proposals/${r.id}` as never}
                        className="block focus-ring rounded-[var(--r-xs)] -mx-1 px-1"
                      >
                        <div className="font-medium text-[color:var(--ink)] tracking-[-0.005em]">
                          {r.title}
                        </div>
                        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5 truncate">
                          {r.clientName}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      {r.creatorName ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={r.creatorName} size={24} />
                          <span className="text-[13px] text-[color:var(--ink)] truncate">
                            {r.creatorName}
                          </span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-[color:var(--ink-faint)]">Unassigned</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <Badge tone={toneFor(r.status)}>
                        {r.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 align-middle text-right tabular text-[color:var(--ink-muted)]">
                      {r.viewCount}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[color:var(--ink-muted)] text-[12px]">
                      {relative(new Date(r.updatedAtISO))}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-right">
                      <span className="font-display tabular text-[15px] text-[color:var(--ink)]">
                        {money(r.total)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 align-middle">
                      <div className="flex justify-end">
                        <RowActions
                          proposalId={r.id}
                          publicId={r.publicId}
                          title={r.title}
                          clientName={r.clientName}
                          clientEmail={r.clientEmail}
                          clientAddress={{
                            address: r.clientAddress,
                            city: r.clientCity,
                            state: r.clientState,
                            zip: r.clientZip,
                          }}
                          materials={r.materials}
                        />
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </motion.tbody>
            </table>
          </div>
        </div>
      )}
      {filtered.length > 0 && (
        <Pagination page={page} pageCount={pageCount} onPage={setPage} />
      )}
    </div>
  );
}

function EmptyLedger({ filter }: { filter: StatusSubFilter }) {
  return (
    <div className="paper-card text-center py-16 px-6">
      <div className="quiet-caps text-[color:var(--ink-faint)] mb-3">Nothing in this view</div>
      <h3 className="font-display text-[22px] font-semibold tracking-[-0.015em] text-[color:var(--ink)] mb-1">
        {filter === "ALL" ? "No proposals yet" : `Nothing ${filter.toLowerCase()} right now`}
      </h3>
      <p className="text-[13px] text-[color:var(--ink-muted)] max-w-md mx-auto">
        {filter === "ALL"
          ? "Draft your first proposal. It will land here, alongside everything else in flight."
          : "When a proposal hits this stage, it'll appear in this view."}
      </p>
    </div>
  );
}

function toneFor(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  return "neutral";
}
