"use client";
import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
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

type Tone = "neutral" | "accent" | "success" | "warn" | "danger";

const TONE: Record<string, Tone> = {
  PAID: "success",
  ACCEPTED: "success",
  VIEWED: "accent",
  SENT: "accent",
  DRAFT: "neutral",
  DECLINED: "danger",
  EXPIRED: "warn",
  ARCHIVED: "neutral",
};

// Lifecycle order for the filter chip row (most "alive" first).
const STATUS_ORDER = [
  "PAID",
  "ACCEPTED",
  "VIEWED",
  "SENT",
  "DRAFT",
  "DECLINED",
  "EXPIRED",
  "ARCHIVED",
] as const;

// Per-status dot colour — ties each chip to its status without shouting.
const DOT: Record<Tone, string> = {
  success: "#1f7a52",
  accent: "var(--accent)",
  warn: "#c89450",
  danger: "var(--rose)",
  neutral: "var(--ink-faint)",
};

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

export function CustomerBookTable({ rows }: { rows: Row[] }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const counts = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) m[r.topStatus] = (m[r.topStatus] ?? 0) + 1;
    return m;
  }, [rows]);

  const presentStatuses = React.useMemo(
    () => STATUS_ORDER.filter((s) => counts[s] > 0),
    [counts],
  );

  const filtered = React.useMemo(
    () => (selected.size === 0 ? rows : rows.filter((r) => selected.has(r.topStatus))),
    [rows, selected],
  );

  function toggle(status: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  const allActive = selected.size === 0;

  return (
    <div className="space-y-3">
      {/* Status filter chips — the "button-like statuses" + count caption */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip active={allActive} onClick={() => setSelected(new Set())} count={rows.length}>
          All
        </FilterChip>
        {presentStatuses.map((s) => (
          <FilterChip
            key={s}
            active={selected.has(s)}
            onClick={() => toggle(s)}
            count={counts[s]}
            dotColor={DOT[TONE[s] ?? "neutral"]}
          >
            {titleCase(s)}
          </FilterChip>
        ))}
        <span className="ml-auto text-[11px] text-[color:var(--ink-muted)] tabular">
          {allActive
            ? `${rows.length} customer${rows.length === 1 ? "" : "s"}`
            : `${filtered.length} of ${rows.length} shown`}
        </span>
      </div>

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
            {filtered.map((r) => (
              <motion.tr
                key={r.id}
                variants={listItem}
                className="border-b border-[color:var(--ink-line)] last:border-0 hover:bg-black/[0.012]"
              >
                <td className="px-5 py-3.5">
                  <Link href={`/dashboard/clients/${r.id}` as any} className="block">
                    <div className="font-medium text-[color:var(--ink)] hover:text-[color:var(--accent)]">
                      {r.name}
                    </div>
                    <div className="text-[11px] text-[color:var(--ink-muted)] mt-0.5">
                      {r.email ?? "—"}
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-3.5">
                  <Badge tone={TONE[r.topStatus] ?? "neutral"} dot>
                    {titleCase(r.topStatus)}
                  </Badge>
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
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-[12px] text-[color:var(--ink-muted)]"
                >
                  No customers match this filter.
                </td>
              </tr>
            )}
          </motion.tbody>
        </table>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  count,
  dotColor,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  dotColor?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[12px] font-medium transition-all focus-ring",
        active
          ? "bg-[color:var(--ink)] text-[color:var(--paper)]"
          : "text-[color:var(--ink-muted)] hover:bg-black/[0.04] hairline",
      )}
    >
      {dotColor && (
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: active ? "currentColor" : dotColor }}
          aria-hidden
        />
      )}
      {children}
      <span className={cn("tabular text-[11px]", active ? "opacity-70" : "text-[color:var(--ink-faint)]")}>
        {count}
      </span>
    </button>
  );
}
