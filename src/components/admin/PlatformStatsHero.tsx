"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { TrendingUp, Building2, UserCircle, FileText, BadgeDollarSign } from "lucide-react";
import { money } from "@/lib/format";

export interface PlatformStats {
  organizations: number;
  users: number;
  proposals: number;
  activeSubs: number;
  estimatedMrr: number;
  organizationsTrend: { label: string; count: number }[];
}

export function PlatformStatsHero({ stats }: { stats: PlatformStats }) {
  const items = [
    {
      label: "Organizations",
      value: stats.organizations.toLocaleString(),
      icon: <Building2 className="h-3.5 w-3.5" />,
      tone: "var(--accent)",
    },
    {
      label: "Users",
      value: stats.users.toLocaleString(),
      icon: <UserCircle className="h-3.5 w-3.5" />,
      tone: "#475569",
    },
    {
      label: "Proposals sent",
      value: stats.proposals.toLocaleString(),
      icon: <FileText className="h-3.5 w-3.5" />,
      tone: "#7C3AED",
    },
    {
      label: "Estimated MRR",
      value: money(stats.estimatedMrr),
      icon: <BadgeDollarSign className="h-3.5 w-3.5" />,
      tone: "#059669",
    },
  ];

  const sparkMax = Math.max(1, ...stats.organizationsTrend.map((t) => t.count));

  return (
    <div className="paper-card p-5 mb-6 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-24 -right-20 h-56 w-56 rounded-full bg-[color:var(--accent)]/[0.06] blur-3xl pointer-events-none"
      />
      <div className="relative">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="quiet-caps">Platform health</div>
            <div className="font-display text-[20px] tracking-[-0.01em] mt-1">
              The whole house · live
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Reporting nominal
          </span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {items.map((it, i) => (
            <motion.div
              key={it.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="paper-card !shadow-none p-3.5"
            >
              <div className="flex items-center justify-between">
                <span className="quiet-caps">{it.label}</span>
                <span style={{ color: it.tone }}>{it.icon}</span>
              </div>
              <div className="font-display tabular text-[26px] mt-1.5 leading-none tracking-[-0.015em]">
                {it.value}
              </div>
            </motion.div>
          ))}
        </div>

        {stats.organizationsTrend.length > 0 && (
          <div className="mt-5 pt-4 border-t border-[color:var(--ink-line)]">
            <div className="flex items-baseline justify-between mb-2">
              <div className="quiet-caps">Organizations · last 12 weeks</div>
              <span className="text-[11px] text-[color:var(--ink-muted)] inline-flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-emerald-700" />
                signups
              </span>
            </div>
            <div className="h-12 grid grid-cols-12 gap-1.5 items-end">
              {stats.organizationsTrend.slice(-12).map((t, i) => (
                <motion.div
                  key={i}
                  initial={{ scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.4, delay: i * 0.02, ease: [0.22, 1, 0.36, 1] }}
                  className="rounded-t-[3px] bg-[color:var(--accent)]/40 origin-bottom"
                  style={{ height: `${(t.count / sparkMax) * 100}%`, minHeight: 2 }}
                  title={`${t.label}: ${t.count}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
