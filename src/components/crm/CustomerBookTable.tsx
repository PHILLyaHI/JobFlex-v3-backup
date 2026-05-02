"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
import { money, relative } from "@/lib/format";
import { listStagger, listItem } from "@/lib/theme/motion";

interface Row {
  id: string;
  name: string;
  email: string | null;
  proposalsCount: number;
  proposalsValue: number;
  ltv: number;
  lastActivity: Date | null;
  topStatus: string;
}

const TONE: Record<string, "neutral" | "accent" | "success" | "warn" | "danger"> = {
  PAID: "success",
  ACCEPTED: "success",
  VIEWED: "accent",
  SENT: "accent",
  DRAFT: "neutral",
  DECLINED: "danger",
  EXPIRED: "warn",
  ARCHIVED: "neutral",
};

export function CustomerBookTable({ rows }: { rows: Row[] }) {
  return (
    <div className="paper-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[color:var(--ink-line)]">
            <th className="quiet-caps px-5 py-3 text-left">Customer</th>
            <th className="quiet-caps px-5 py-3 text-left">Top status</th>
            <th className="quiet-caps px-5 py-3 text-right w-[100px]">Quotes</th>
            <th className="quiet-caps px-5 py-3 text-right w-[140px]">Quoted value</th>
            <th className="quiet-caps px-5 py-3 text-right w-[140px]">Lifetime value</th>
            <th className="quiet-caps px-5 py-3 text-left w-[140px]">Last activity</th>
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
                  href={`/dashboard/clients/${r.id}` as any}
                  className="block"
                >
                  <div className="font-medium text-[color:var(--ink)] hover:text-[color:var(--accent)]">
                    {r.name}
                  </div>
                  <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                    {r.email ?? "—"}
                  </div>
                </Link>
              </td>
              <td className="px-5 py-3.5">
                <Badge tone={TONE[r.topStatus] ?? "neutral"}>{r.topStatus.toLowerCase()}</Badge>
              </td>
              <td className="px-5 py-3.5 text-right tabular text-[color:var(--ink-soft)]">
                {r.proposalsCount}
              </td>
              <td className="px-5 py-3.5 text-right font-display tabular text-[14px]">
                {money(r.proposalsValue)}
              </td>
              <td className="px-5 py-3.5 text-right font-display tabular text-[14px] text-emerald-700">
                {r.ltv > 0 ? money(r.ltv) : <span className="text-[color:var(--ink-faint)]">—</span>}
              </td>
              <td className="px-5 py-3.5 text-[12px] text-[color:var(--ink-muted)] tabular">
                {r.lastActivity ? relative(r.lastActivity) : "—"}
              </td>
            </motion.tr>
          ))}
        </motion.tbody>
      </table>
    </div>
  );
}
