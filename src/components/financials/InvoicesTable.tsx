"use client";
import * as React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { money, shortDate } from "@/lib/format";
import { listStagger, listItem } from "@/lib/theme/motion";

export interface InvoiceRow {
  id: string;
  number: string;
  proposalId: string | null;
  clientName: string;
  amount: number;
  status: string;
  provider: string;
  dueDate: Date | null;
  paidAt: Date | null;
}

const TONE: Record<string, "neutral" | "accent" | "success" | "danger" | "warn"> = {
  PENDING: "warn",
  PAID: "success",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export function InvoicesTable({ rows }: { rows: InvoiceRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="paper-card p-10 text-center">
        <div className="font-medium text-[color:var(--ink)]">No invoices yet</div>
        <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
          Invoices appear automatically when a proposal is accepted or marked paid.
        </div>
      </div>
    );
  }

  const totals = rows.reduce(
    (a, r) => {
      a.total += r.amount;
      if (r.status === "PAID") a.paid += r.amount;
      if (r.status === "PENDING") a.pending += r.amount;
      return a;
    },
    { total: 0, paid: 0, pending: 0 },
  );
  const now = new Date();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="paper-card p-4">
          <div className="quiet-caps">Total billed</div>
          <div className="font-display tabular text-[24px] mt-1.5 leading-none">
            {money(totals.total)}
          </div>
        </div>
        <div className="paper-card p-4">
          <div className="quiet-caps">Collected</div>
          <div className="font-display tabular text-[24px] mt-1.5 leading-none text-emerald-700">
            {money(totals.paid)}
          </div>
        </div>
        <div className="paper-card p-4">
          <div className="quiet-caps">Outstanding</div>
          <div className="font-display tabular text-[24px] mt-1.5 leading-none text-amber-700">
            {money(totals.pending)}
          </div>
        </div>
      </div>

      <div className="paper-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:var(--ink-line)]">
              <th className="quiet-caps px-5 py-3 text-left">Invoice</th>
              <th className="quiet-caps px-5 py-3 text-left">Client</th>
              <th className="quiet-caps px-5 py-3 text-left">Status</th>
              <th className="quiet-caps px-5 py-3 text-left">Provider</th>
              <th className="quiet-caps px-5 py-3 text-left w-[120px]">Due</th>
              <th className="quiet-caps px-5 py-3 text-right w-[140px]">Amount</th>
            </tr>
          </thead>
          <motion.tbody variants={listStagger} initial="initial" animate="animate">
            {rows.map((r) => {
              const overdue = r.status === "PENDING" && r.dueDate && r.dueDate < now;
              return (
                <motion.tr
                  key={r.id}
                  variants={listItem}
                  className="border-b border-[color:var(--ink-line)] last:border-0 hover:bg-black/[0.012]"
                >
                  <td className="px-5 py-3.5">
                    {r.proposalId ? (
                      <Link
                        href={`/dashboard/proposals/${r.proposalId}` as any}
                        className="font-medium text-[color:var(--ink)] hover:text-[color:var(--accent)]"
                      >
                        #{r.number}
                      </Link>
                    ) : (
                      <span className="font-medium text-[color:var(--ink)]">#{r.number}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[12.5px] text-[color:var(--ink-soft)]">
                    {r.clientName}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="inline-flex items-center gap-1.5">
                      <Badge tone={TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge>
                      {overdue && (
                        <span className="text-[10px] text-rose-700 tracking-[0.10em] uppercase">
                          overdue
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-[11px] tracking-[0.10em] uppercase text-[color:var(--ink-muted)]">
                    {r.provider.toLowerCase()}
                  </td>
                  <td className="px-5 py-3.5 text-[12px] text-[color:var(--ink-muted)] tabular">
                    {r.dueDate ? shortDate(r.dueDate) : "—"}
                  </td>
                  <td className="px-5 py-3.5 text-right font-display tabular text-[14px]">
                    {money(r.amount)}
                  </td>
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}
