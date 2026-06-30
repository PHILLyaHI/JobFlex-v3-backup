"use client";
import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import { money } from "@/lib/format";
import type { MonthBucket } from "@/actions/financials";

/**
 * Revenue vs Expenses — the financials showcase band. A confident, elevated
 * "ledger" card: window totals headline the top rail, two tonal areas (Pressed
 * Sage revenue over Amber expenses) tell the story, and a custom tooltip carries
 * the per-month net. Data is real — paid payments vs job expenses from the DB.
 */
export function RevenueExpenseChart({ data }: { data: MonthBucket[] }) {
  const totals = React.useMemo(() => {
    const revenue = data.reduce((a, b) => a + b.revenue, 0);
    const expenses = data.reduce((a, b) => a + b.expenses, 0);
    return { revenue, expenses, net: revenue - expenses };
  }, [data]);

  const netUp = totals.net >= 0;

  return (
    <div className="paper-card relative overflow-hidden !shadow-[var(--shadow-md)] p-0">
      {/* tinted wash — quiet boldness, anchored to the accent */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-32"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent)",
        }}
      />

      <div className="relative p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="quiet-caps">Revenue vs Expenses</div>
            <div className="mt-1 text-[12px] text-[color:var(--ink-muted)]">
              Last 12 months · paid invoices against job expenses
            </div>
          </div>

          {/* window totals — the headline numbers */}
          <div className="flex items-stretch gap-5">
            <HeadStat label="Revenue" value={totals.revenue} swatch="var(--accent)" />
            <span className="w-px self-stretch bg-[color:var(--ink-line)]" aria-hidden />
            <HeadStat label="Expenses" value={totals.expenses} swatch="var(--amber)" />
            <span className="w-px self-stretch bg-[color:var(--ink-line)]" aria-hidden />
            <div className="flex flex-col justify-center">
              <div className="quiet-caps !text-[10px]">Net</div>
              <div
                className="mt-1 flex items-center gap-1 font-display tabular text-[22px] leading-none tracking-[-0.02em]"
                style={{ color: netUp ? "var(--accent)" : "var(--rose)" }}
              >
                {netUp ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {money(totals.net)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 h-[260px] w-full">
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="g-rev" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#1F7A52" stopOpacity={0.34} />
                  <stop offset="100%" stopColor="#1F7A52" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="g-exp" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#C89450" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#C89450" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(20,24,31,0.05)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#5a6473", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                dy={4}
              />
              <YAxis
                tick={{ fill: "#5a6473", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  Math.abs(v) >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                }
                width={48}
              />
              <Tooltip
                cursor={{ stroke: "rgba(20,24,31,0.12)", strokeWidth: 1 }}
                content={<ChartTooltip />}
              />
              <Area
                type="monotone"
                name="Expenses"
                dataKey="expenses"
                stroke="#C89450"
                strokeWidth={1.5}
                fill="url(#g-exp)"
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                name="Revenue"
                dataKey="revenue"
                stroke="#1F7A52"
                strokeWidth={2}
                fill="url(#g-rev)"
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* legend — quiet, tonal dots */}
        <div className="mt-2 flex items-center gap-5 text-[11px] text-[color:var(--ink-muted)]">
          <LegendDot color="var(--accent)" label="Revenue" />
          <LegendDot color="var(--amber)" label="Expenses" />
        </div>
      </div>
    </div>
  );
}

function HeadStat({ label, value, swatch }: { label: string; value: number; swatch: string }) {
  return (
    <div className="flex flex-col justify-center">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ background: swatch }} />
        <span className="quiet-caps !text-[10px]">{label}</span>
      </div>
      <div className="mt-1 font-display tabular text-[22px] leading-none tracking-[-0.02em] text-[color:var(--ink)]">
        {money(value)}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

interface TipPayload {
  dataKey?: string | number;
  value?: number | string;
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const find = (k: string) => Number(payload.find((p) => p.dataKey === k)?.value ?? 0);
  const rev = find("revenue");
  const exp = find("expenses");
  const net = rev - exp;
  return (
    <div className="rounded-[var(--r-md)] border-[0.5px] border-black/10 bg-white/95 px-3 py-2.5 shadow-[var(--shadow-md)] backdrop-blur-md">
      <div className="quiet-caps !mb-2 !text-[10px]">{label}</div>
      <TipRow color="var(--accent)" label="Revenue" value={rev} />
      <TipRow color="var(--amber)" label="Expenses" value={exp} />
      <div className="mt-2 flex items-center justify-between gap-8 border-t border-black/[0.07] pt-1.5">
        <span className="text-[11px] font-medium text-[color:var(--ink-soft)]">Net</span>
        <span
          className="tabular text-[12px] font-semibold"
          style={{ color: net >= 0 ? "var(--accent)" : "var(--rose)" }}
        >
          {money(net)}
        </span>
      </div>
    </div>
  );
}

function TipRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-8 py-0.5">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-[color:var(--ink-muted)]">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="tabular text-[12px] text-[color:var(--ink)]">{money(value)}</span>
    </div>
  );
}
