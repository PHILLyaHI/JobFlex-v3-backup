"use client";
import * as React from "react";
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from "recharts";
import { money } from "@/lib/format";

interface Props {
  marginPct: number;
  revenue: number;
  expenses: number;
  profit: number;
}

/**
 * Profit-margin card — the showcase band's companion. A radial gauge is the
 * memorable anchor; the numeral is tone-coded (Strong → Bleeding) and the three
 * tinted footing chips ground it in real revenue / expenses / profit (30-day).
 */
export function ProfitMarginGauge({ marginPct, revenue, expenses, profit }: Props) {
  const value = Math.max(-50, Math.min(100, marginPct));
  const tone =
    value >= 25 ? "#059669" : value >= 10 ? "#1F7A52" : value >= 0 ? "#C89450" : "#E11D48";
  const verdict =
    value >= 25 ? "Strong" : value >= 10 ? "Healthy" : value >= 0 ? "Tight" : "Bleeding";
  const data = [{ name: "Margin", value: Math.max(0, value), fill: tone }];

  return (
    <div className="paper-card relative flex flex-col overflow-hidden !shadow-[var(--shadow-md)] p-5 sm:p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-28"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${tone} 9%, transparent), transparent)`,
        }}
      />

      <div className="relative flex items-baseline justify-between">
        <div>
          <div className="quiet-caps">Profit margin</div>
          <div className="mt-1 text-[12px] text-[color:var(--ink-muted)]">
            Last 30 days · profit ÷ revenue
          </div>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.10em]"
          style={{
            color: tone,
            background: `color-mix(in srgb, ${tone} 12%, transparent)`,
          }}
        >
          {verdict}
        </span>
      </div>

      <div className="relative mx-auto mt-1 h-[176px] w-full max-w-[260px]">
        <ResponsiveContainer>
          <RadialBarChart
            innerRadius="76%"
            outerRadius="100%"
            data={data}
            startAngle={216}
            endAngle={-36}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar
              dataKey="value"
              cornerRadius={14}
              background={{ fill: "rgba(20,24,31,0.06)" }}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div
            className="font-display tabular text-[40px] leading-none tracking-[-0.025em]"
            style={{ color: tone }}
          >
            {value.toFixed(1)}%
          </div>
          <div className="mt-1.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-muted)]">
            Margin
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2.5">
        <FootStat label="Revenue" value={money(revenue)} />
        <FootStat label="Expenses" value={money(expenses)} />
        <FootStat label="Profit" value={money(profit)} tone={tone} />
      </div>
    </div>
  );
}

function FootStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-[var(--r-md)] hairline bg-white/50 px-2.5 py-2 text-center">
      <div className="text-[9px] uppercase tracking-[0.10em] text-[color:var(--ink-muted)]">
        {label}
      </div>
      <div
        className="mt-1 font-display tabular text-[14px] leading-none"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
