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

export function ProfitMarginGauge({ marginPct, revenue, expenses, profit }: Props) {
  const value = Math.max(-50, Math.min(100, marginPct));
  const tone =
    value >= 25 ? "#059669" : value >= 10 ? "#1F7A52" : value >= 0 ? "#C89450" : "#E11D48";
  const data = [{ name: "Margin", value: Math.max(0, value), fill: tone }];

  return (
    <div className="paper-card p-5 flex flex-col">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="quiet-caps">Profit margin · 30d</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] mt-1">
            Profit ÷ revenue
          </div>
        </div>
      </div>
      <div className="relative h-[180px] -my-2">
        <ResponsiveContainer>
          <RadialBarChart
            innerRadius="78%"
            outerRadius="100%"
            data={data}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "rgba(17,17,19,0.06)" }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div
            className="font-display tabular text-[34px] leading-none tracking-[-0.02em]"
            style={{ color: tone }}
          >
            {value.toFixed(1)}%
          </div>
          <div className="text-[10px] text-[color:var(--ink-muted)] tracking-[0.10em] uppercase mt-1">
            {value >= 25
              ? "Strong"
              : value >= 10
                ? "Healthy"
                : value >= 0
                  ? "Tight"
                  : "Bleeding"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-3 text-center">
        <div className="paper-card !shadow-none p-2">
          <div className="text-[9px] tracking-[0.10em] uppercase text-[color:var(--ink-muted)]">
            Revenue
          </div>
          <div className="font-display tabular text-[14px] mt-0.5">{money(revenue)}</div>
        </div>
        <div className="paper-card !shadow-none p-2">
          <div className="text-[9px] tracking-[0.10em] uppercase text-[color:var(--ink-muted)]">
            Expenses
          </div>
          <div className="font-display tabular text-[14px] mt-0.5">{money(expenses)}</div>
        </div>
        <div className="paper-card !shadow-none p-2">
          <div className="text-[9px] tracking-[0.10em] uppercase text-[color:var(--ink-muted)]">
            Profit
          </div>
          <div className="font-display tabular text-[14px] mt-0.5" style={{ color: tone }}>
            {money(profit)}
          </div>
        </div>
      </div>
    </div>
  );
}
