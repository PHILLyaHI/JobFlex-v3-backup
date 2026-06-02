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
  Legend,
} from "recharts";
import { money } from "@/lib/format";
import type { MonthBucket } from "@/actions/financials";

export function RevenueExpenseChart({ data }: { data: MonthBucket[] }) {
  return (
    <div className="paper-card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="quiet-caps">Revenue vs Expenses</div>
          <div className="text-[12px] text-[color:var(--ink-muted)] mt-1">
            Last 12 months · paid invoices vs job expenses
          </div>
        </div>
      </div>
      <div className="h-[240px] w-full">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="g-rev" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#1F7A52" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#1F7A52" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="g-exp" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#C89450" stopOpacity={0.36} />
                <stop offset="100%" stopColor="#C89450" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(17,17,19,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#6B6A64", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#6B6A64", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "rgba(17,17,19,0.08)", strokeWidth: 1 }}
              contentStyle={{
                background: "rgba(255,255,255,0.95)",
                backdropFilter: "blur(12px)",
                border: "0.5px solid rgba(17,17,19,0.12)",
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(v, name) => [money(Number(v ?? 0)), String(name)]}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
            />
            <Area
              type="monotone"
              name="Revenue"
              dataKey="revenue"
              stroke="#1F7A52"
              strokeWidth={1.5}
              fill="url(#g-rev)"
              activeDot={{ r: 4, strokeWidth: 0 }}
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
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
