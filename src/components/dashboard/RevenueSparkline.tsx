"use client";
import { AreaChart, Area, ResponsiveContainer, Tooltip } from "recharts";

export function RevenueSparkline({ data }: { data: { day: string; revenue: number }[] }) {
  return (
    <div className="h-[88px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            cursor={{ stroke: "#111113", strokeOpacity: 0.12 }}
            contentStyle={{
              background: "#FAFAF7",
              border: "0.5px solid #E8E6DE",
              borderRadius: 10,
              fontSize: 11,
            }}
            formatter={(v) => [`$${Number(v).toLocaleString()}`, "Revenue"] as [string, string]}
          />
          <Area
            type="monotone"
            dataKey="revenue"
            stroke="#4F46E5"
            strokeWidth={1.5}
            fill="url(#rev)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
