"use client";
import * as React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { toast } from "@/components/ui/Toast";
import { money, shortDate } from "@/lib/format";
import { listStagger, listItem } from "@/lib/theme/motion";
import { sendChangeOrder, deleteChangeOrder } from "@/actions/changeOrders";
import { useRouter } from "next/navigation";

export interface ChangeOrderRow {
  id: string;
  jobId: string;
  jobTitle: string;
  title: string;
  amount: number;
  status: string;
  createdAt: Date;
}

const TONE: Record<string, "neutral" | "accent" | "success" | "danger"> = {
  DRAFT: "neutral",
  SENT: "accent",
  APPROVED: "success",
  DECLINED: "danger",
};

export function ChangeOrdersTable({ rows }: { rows: ChangeOrderRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function onSend(id: string) {
    setBusy(id);
    try {
      await sendChangeOrder(id);
      toast.success("Sent");
      router.refresh();
    } catch (err: any) {
      toast.error("Couldn't send", err?.message);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Delete this draft?")) return;
    setBusy(id);
    try {
      await deleteChangeOrder(id);
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
        <div className="font-medium text-[color:var(--ink)]">No change orders</div>
        <div className="text-[12px] text-[color:var(--ink-muted)] mt-1.5 leading-relaxed max-w-sm mx-auto">
          Change orders are created from any job's detail page when the scope shifts after the
          contract is signed.
        </div>
      </div>
    );
  }

  const grouped = rows.reduce<{ DRAFT: ChangeOrderRow[]; SENT: ChangeOrderRow[]; APPROVED: ChangeOrderRow[]; DECLINED: ChangeOrderRow[] }>(
    (a, r) => {
      const k = (r.status as keyof typeof a) ?? "DRAFT";
      if (a[k]) a[k].push(r);
      return a;
    },
    { DRAFT: [], SENT: [], APPROVED: [], DECLINED: [] },
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["DRAFT", "SENT", "APPROVED", "DECLINED"] as const).map((k) => {
          const total = grouped[k].reduce((a, r) => a + r.amount, 0);
          return (
            <div key={k} className="paper-card p-4">
              <div className="quiet-caps">{k.toLowerCase()}</div>
              <div className="font-display tabular text-[26px] mt-1.5 leading-none">
                {grouped[k].length}
              </div>
              <div className="text-[11px] text-[color:var(--ink-muted)] tabular mt-1.5">
                {money(total)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="paper-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[color:var(--ink-line)]">
              <th className="quiet-caps px-5 py-3 text-left">Change order</th>
              <th className="quiet-caps px-5 py-3 text-left">Job</th>
              <th className="quiet-caps px-5 py-3 text-left">Status</th>
              <th className="quiet-caps px-5 py-3 text-left w-[120px]">Created</th>
              <th className="quiet-caps px-5 py-3 text-right w-[140px]">Amount</th>
              <th className="quiet-caps px-3 py-3 w-[100px]" aria-label="Actions" />
            </tr>
          </thead>
          <motion.tbody variants={listStagger} initial="initial" animate="animate">
            {rows.map((r) => (
              <motion.tr
                key={r.id}
                variants={listItem}
                className="border-b border-[color:var(--ink-line)] last:border-0 hover:bg-black/[0.012]"
              >
                <td className="px-5 py-3.5 font-medium text-[color:var(--ink)]">{r.title}</td>
                <td className="px-5 py-3.5">
                  <Link
                    href={`/dashboard/jobs/${r.jobId}` as any}
                    className="text-[12px] text-[color:var(--ink-soft)] hover:text-[color:var(--accent)]"
                  >
                    {r.jobTitle}
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <Badge tone={TONE[r.status] ?? "neutral"}>{r.status.toLowerCase()}</Badge>
                </td>
                <td className="px-5 py-3.5 text-[12px] text-[color:var(--ink-muted)] tabular">
                  {shortDate(r.createdAt)}
                </td>
                <td
                  className={`px-5 py-3.5 text-right font-display tabular text-[14px] ${
                    r.amount < 0 ? "text-rose-700" : "text-[color:var(--ink)]"
                  }`}
                >
                  {r.amount >= 0 ? "+" : "−"}
                  {money(Math.abs(r.amount))}
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex justify-end gap-1">
                    {r.status === "DRAFT" && (
                      <>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => onSend(r.id)}
                          className="h-7 px-2 inline-flex items-center gap-1 text-[11px] rounded-[var(--r-sm)] text-[color:var(--accent)] hover:bg-[color:var(--accent-soft)]/50 disabled:opacity-40"
                          aria-label="Send"
                        >
                          <Send className="h-3 w-3" />
                          Send
                        </button>
                        <button
                          type="button"
                          disabled={busy === r.id}
                          onClick={() => onDelete(r.id)}
                          className="h-7 w-7 grid place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-muted)] hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"
                          aria-label="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}
