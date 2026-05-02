"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/Badge";
import { BulkBar } from "@/components/proposal/BulkBar";
import { RowActions } from "@/components/proposal/RowActions";
import type { MaterialLine } from "@/components/proposal/MaterialsSheet";
import { toast } from "@/components/ui/Toast";
import { money, relative } from "@/lib/format";
import {
  bulkUpdateProposalStatus,
  bulkDeleteProposals,
} from "@/actions/proposals";
import { listStagger, listItem } from "@/lib/theme/motion";

export type ProposalRow = {
  id: string;
  publicId: string;
  title: string;
  status: string;
  total: number;
  clientName: string;
  clientEmail?: string | null;
  clientAddress?: string | null;
  clientCity?: string | null;
  clientState?: string | null;
  clientZip?: string | null;
  updatedAt: Date;
  viewCount: number;
  materials: MaterialLine[];
};

export function ProposalsTable({ rows }: { rows: ProposalRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }
  function clear() {
    setSelected(new Set());
  }

  async function bulkAction(fn: () => Promise<unknown>, msg: string) {
    try {
      await fn();
      toast.success(msg);
      clear();
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't complete", err?.message);
    }
  }

  const selectedCount = selected.size;
  const allChecked = rows.length > 0 && selected.size === rows.length;

  const totalOfSelection = rows.filter((r) => selected.has(r.id)).reduce((a, r) => a + r.total, 0);
  const pipelineTotal = rows.reduce((a, r) => a + r.total, 0);

  return (
    <>
      <div className="paper-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[color:var(--ink-line)]">
                <th className="w-10 px-5 py-3">
                  <Checkbox
                    checked={allChecked}
                    onToggle={toggleAll}
                    ariaLabel="Select all"
                  />
                </th>
                <th className="quiet-caps px-5 py-3 text-left">Proposal</th>
                <th className="quiet-caps px-5 py-3 text-left">Status</th>
                <th className="quiet-caps px-5 py-3 text-right w-[80px]">Views</th>
                <th className="quiet-caps px-5 py-3 text-left w-[120px]">Updated</th>
                <th className="quiet-caps px-5 py-3 text-right w-[140px]">Total</th>
                <th className="w-[56px] px-3 py-3" aria-label="Actions" />
              </tr>
            </thead>
            <motion.tbody variants={listStagger} initial="initial" animate="animate">
              {rows.map((r, i) => {
                const isSelected = selected.has(r.id);
                return (
                  <motion.tr
                    key={r.id}
                    variants={listItem}
                    className={cn(
                      "border-b border-[color:var(--ink-line)] last:border-0 transition-colors",
                      isSelected && "bg-[color:var(--accent-soft)]/50",
                      !isSelected && i % 2 === 1 && "bg-black/[0.012] dark:bg-white/[0.012]",
                    )}
                  >
                    <td className="px-5 py-3.5 align-middle">
                      <Checkbox
                        checked={isSelected}
                        onToggle={() => toggle(r.id)}
                        ariaLabel={`Select ${r.title}`}
                      />
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/proposals/${r.id}` as any} className="block">
                        <div className="font-medium text-[color:var(--ink)]">{r.title}</div>
                        <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                          {r.clientName}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 align-middle">
                      <Badge tone={toneFor(r.status)}>{r.status}</Badge>
                    </td>
                    <td className="px-5 py-3.5 align-middle text-right tabular text-[color:var(--ink-muted)]">
                      {r.viewCount}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-[color:var(--ink-muted)]">
                      {relative(r.updatedAt)}
                    </td>
                    <td className="px-5 py-3.5 align-middle text-right">
                      <span className="font-display text-[15px] tabular text-[color:var(--ink)]">
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
                );
              })}
            </motion.tbody>
          </table>
        </div>
        <div className="border-t border-[color:var(--ink-line)] px-5 py-3 text-xs text-[color:var(--ink-muted)] flex items-center justify-between">
          <span>
            {rows.length} proposal{rows.length === 1 ? "" : "s"} · {money(pipelineTotal)} pipeline
          </span>
          {selectedCount > 0 && (
            <span className="text-[color:var(--ink-soft)]">
              {selectedCount} selected · {money(totalOfSelection)}
            </span>
          )}
        </div>
      </div>

      <BulkBar
        count={selectedCount}
        onClear={clear}
        onMarkPaid={() =>
          bulkAction(
            () => bulkUpdateProposalStatus(Array.from(selected), "PAID"),
            `Marked ${selectedCount} paid`,
          )
        }
        onArchive={() =>
          bulkAction(
            () => bulkUpdateProposalStatus(Array.from(selected), "ARCHIVED"),
            `Archived ${selectedCount}`,
          )
        }
        onDelete={() =>
          bulkAction(
            () => bulkDeleteProposals(Array.from(selected)),
            `Deleted ${selectedCount}`,
          )
        }
      />
    </>
  );
}

function Checkbox({
  checked,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        "h-4 w-4 rounded-[4px] transition-all flex items-center justify-center shrink-0",
        checked
          ? "bg-[color:var(--ink)] border-transparent"
          : "bg-white dark:bg-white/5 hairline hover:border-[color:var(--ink-muted)]",
      )}
    >
      {checked && (
        <svg
          viewBox="0 0 10 8"
          fill="none"
          className="h-2 w-2.5 text-[color:var(--paper)]"
        >
          <path
            d="M1 4.5L3.5 7L9 1"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

function toneFor(s: string): "neutral" | "accent" | "success" | "warn" | "danger" {
  if (s === "ACCEPTED" || s === "PAID") return "success";
  if (s === "SENT" || s === "VIEWED") return "accent";
  if (s === "DECLINED" || s === "EXPIRED") return "danger";
  return "neutral";
}
