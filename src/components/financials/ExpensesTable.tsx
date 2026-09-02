"use client";
import * as React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Trash2, Receipt, ExternalLink } from "lucide-react";
import { safeHref } from "@/lib/safeHref";
import { toast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { money, shortDate } from "@/lib/format";
import { listStagger, listItem } from "@/lib/theme/motion";
import { deleteJobExpense } from "@/actions/expenses";
import { useRouter } from "next/navigation";

export interface ExpenseRow {
  id: string;
  jobId: string;
  jobTitle: string;
  category: string;
  amount: number;
  note: string | null;
  receiptUrl: string | null;
  createdAt: Date;
}

interface Props {
  rows: ExpenseRow[];
}

export function ExpensesTable({ rows }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function onDelete(id: string) {
    if (!confirm("Delete this expense?")) return;
    setBusy(id);
    try {
      await deleteJobExpense(id);
      toast.success("Deleted");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't delete", err?.message);
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="paper-card p-10 text-center">
        <Receipt className="h-6 w-6 text-[color:var(--ink-faint)] mx-auto mb-3" />
        <div className="font-medium text-[color:var(--ink)]">No expenses recorded</div>
        <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
          Drop a receipt above or add one manually from any job's Expenses tab.
        </div>
      </div>
    );
  }

  return (
    <div className="paper-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[color:var(--ink-line)]">
            <th className="quiet-caps px-5 py-3 text-left">Job</th>
            <th className="quiet-caps px-5 py-3 text-left">Category</th>
            <th className="quiet-caps px-5 py-3 text-left">Note</th>
            <th className="quiet-caps px-5 py-3 text-left w-[100px]">Date</th>
            <th className="quiet-caps px-5 py-3 text-right w-[120px]">Amount</th>
            <th className="quiet-caps px-3 py-3 w-[80px]" aria-label="Actions" />
          </tr>
        </thead>
        <motion.tbody variants={listStagger} initial="initial" animate="animate">
          {rows.map((r) => (
            <motion.tr
              key={r.id}
              variants={listItem}
              className="border-b border-[color:var(--ink-line)] last:border-0 hover:bg-black/[0.012]"
            >
              <td className="px-5 py-3.5">
                <Link
                  href={`/dashboard/jobs/${r.jobId}` as any}
                  className="text-[color:var(--ink)] hover:text-[color:var(--accent)] font-medium"
                >
                  {r.jobTitle}
                </Link>
              </td>
              <td className="px-5 py-3.5">
                <Badge tone="neutral">{r.category}</Badge>
              </td>
              <td className="px-5 py-3.5 text-[12px] text-[color:var(--ink-soft)] truncate max-w-[280px]">
                {r.note ?? <span className="text-[color:var(--ink-faint)]">—</span>}
              </td>
              <td className="px-5 py-3.5 text-[12px] text-[color:var(--ink-muted)] tabular">
                {shortDate(r.createdAt)}
              </td>
              <td className="px-5 py-3.5 text-right font-display tabular text-[14px]">
                {money(r.amount)}
              </td>
              <td className="px-3 py-3.5">
                <div className="flex justify-end gap-1">
                  {safeHref(r.receiptUrl) && (
                    <a
                      href={safeHref(r.receiptUrl) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-black/[0.04]"
                      aria-label="Open receipt"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => onDelete(r.id)}
                    className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                    aria-label="Delete expense"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
