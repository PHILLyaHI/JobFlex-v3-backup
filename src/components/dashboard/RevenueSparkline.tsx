"use client";
import * as React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { money } from "@/lib/format";

/* On-system palette (locked tokens from globals.css). The reference for this
   chart was indigo; this project's single accent is Pressed Sage, so the
   diagonal-pinstripe fill + ring markers carry the look in-palette. */
const ACCENT = "#1f7a52";
const ACCENT_SOFT = "#e0f0e8";
const INK_MUTED = "#5a6473";
const INK_LINE = "#e4e8ee";

type Point = { day: string; revenue: number; iso?: string };

const RANGES = [
  { key: 7, label: "Last 7 Days" },
  { key: 14, label: "Last 14 Days" },
  { key: 30, label: "Last 30 Days" },
] as const;

function weekdayShort(iso: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(
    new Date(`${iso}T00:00:00`),
  );
}

function longDay(p: Point) {
  if (!p.iso) return p.day;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date(`${p.iso}T00:00:00`));
}

/* Hollow ring marker — drawn on every point in the 7-day view. */
function RingDot(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3.5} fill="#ffffff" stroke={ACCENT} strokeWidth={1.75} />;
}

/* Emphasized point on hover: soft sage halo + crisp ring. */
function ActiveRingDot(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <g>
      <circle cx={cx} cy={cy} r={9} fill={ACCENT} fillOpacity={0.1} />
      <circle cx={cx} cy={cy} r={4.5} fill="#ffffff" stroke={ACCENT} strokeWidth={2.5} />
    </g>
  );
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  // Recharts injects these for custom content: the active point's pixel
  // position and the plotting rectangle.
  coordinate?: { x?: number; y?: number };
  viewBox?: { x?: number; y?: number; width?: number; height?: number };
  // Fixed Y-axis upper bound, passed from the parent so the tooltip can map a
  // point's value back to its pixel-Y (the dot) instead of using the mouse Y.
  yMax?: number;
}

const CARD_MIN_W = 148;
const CARD_EST_H = 78; // card + caret; only used to decide the above/below flip
const GAP = 8;

// The wrapper is pinned to the chart origin (position={{x:0,y:0}} on <Tooltip>),
// so we place the card ourselves: centered on the active point's x (clamped to
// the plot area), sitting just above the data point with the caret pointing
// back at it. Flips below when there isn't room up top.
function ChartTooltip({ active, payload, coordinate, viewBox, yMax }: TooltipProps) {
  if (!active || !payload?.length || coordinate?.x == null || coordinate?.y == null) {
    return null;
  }
  const p = payload[0].payload;
  const px = coordinate.x;

  const half = CARD_MIN_W / 2;
  const vx = viewBox?.x ?? 0;
  const vw = viewBox?.width ?? 0;
  const vy = viewBox?.y ?? 0;
  const vh = viewBox?.height ?? 0;
  // Anchor to the dot, not the cursor: map the point's value to its pixel-Y
  // across the fixed domain [0, yMax]. (value=yMax → plot top; value=0 → bottom.)
  // Fall back to the cursor Y only if the bounds are unavailable.
  const py = yMax && yMax > 0 && vh ? vy + vh * (1 - p.revenue / yMax) : coordinate.y;
  const left = vw ? Math.max(vx + half, Math.min(vx + vw - half, px)) : px;
  const caretDx = px - left; // re-point the caret at the true x after clamping

  const placeBelow = py - vy < CARD_EST_H + GAP;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top: py,
        transform: `translate(-50%, ${placeBelow ? `${GAP}px` : `calc(-100% - ${GAP}px)`})`,
        pointerEvents: "none",
      }}
    >
      <div className="relative">
        <div
          className="rounded-[14px] bg-white px-5 py-3 text-center"
          style={{
            border: `1px solid ${INK_LINE}`,
            boxShadow:
              "0 2px 6px rgba(20,24,31,0.05), 0 8px 24px rgba(20,24,31,0.08)",
            minWidth: CARD_MIN_W,
          }}
        >
          <div className="font-display tabular text-[22px] leading-none tracking-[-0.02em] text-[color:var(--ink)]">
            {money(p.revenue)}
          </div>
          <div className="mt-1.5 text-[12px] text-[color:var(--ink-muted)]">{longDay(p)}</div>
        </div>
        {/* caret points back at the active point: down when the card is above
            the cursor, up when it flips below. */}
        <div
          className="absolute h-3 w-3 rotate-45 bg-white"
          style={{
            left: `calc(50% + ${caretDx}px)`,
            marginLeft: -6,
            ...(placeBelow
              ? { top: -6, borderLeft: `1px solid ${INK_LINE}`, borderTop: `1px solid ${INK_LINE}` }
              : { bottom: -6, borderRight: `1px solid ${INK_LINE}`, borderBottom: `1px solid ${INK_LINE}` }),
          }}
        />
      </div>
    </div>
  );
}

export function RevenueSparkline({ data }: { data: Point[] }) {
  const [range, setRange] = React.useState<number>(7);

  const view = React.useMemo(
    () =>
      data.slice(-range).map((d) => ({
        ...d,
        name: range === 7 && d.iso ? weekdayShort(d.iso) : d.day,
      })),
    [data, range],
  );

  // Y-axis upper bound, computed once so the axis scale and the tooltip's
  // value-to-pixel math share an identical domain (keeps the card on the dot).
  const yMax = React.useMemo(() => {
    const max = view.reduce((m, d) => Math.max(m, d.revenue), 0);
    return Math.ceil((max * 1.15) / 100) * 100 || 100;
  }, [view]);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="font-display text-[17px] leading-tight tracking-[-0.015em] text-[color:var(--ink)]">
          Revenue trend
        </h3>
        <div className="relative inline-flex">
          <select
            aria-label="Select date range"
            value={range}
            onChange={(e) => setRange(Number(e.target.value))}
            className="h-9 cursor-pointer appearance-none rounded-[var(--r-md)] border border-[color:var(--ink-line)] bg-white/70 pl-3.5 pr-9 text-[13px] font-medium text-[color:var(--ink)] outline-none transition-colors hover:border-[color:var(--ink-muted)]/50 focus-visible:shadow-[0_0_0_3px_rgba(31,122,82,0.18)]"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--ink-muted)]" />
        </div>
      </div>

      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={view} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <defs>
              {/* diagonal pinstripe fill — the chart's signature texture */}
              <pattern
                id="rev-hatch"
                patternUnits="userSpaceOnUse"
                width={7}
                height={7}
                patternTransform="rotate(45)"
              >
                <rect width={7} height={7} fill={ACCENT_SOFT} fillOpacity={0.55} />
                <line x1={0} y1={0} x2={0} y2={7} stroke={ACCENT} strokeOpacity={0.16} strokeWidth={1.1} />
              </pattern>
            </defs>

            <CartesianGrid stroke="rgba(20,24,31,0.06)" />

            <XAxis
              dataKey="name"
              tick={{ fill: INK_MUTED, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              dy={8}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tick={{ fill: INK_MUTED, fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={(v: number) =>
                v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
              }
              domain={[0, yMax]}
            />

            <Tooltip
              content={<ChartTooltip yMax={yMax} />}
              cursor={{ stroke: ACCENT, strokeWidth: 1.25, strokeOpacity: 0.55 }}
              // Pin the wrapper to the chart origin; ChartTooltip then places the
              // card itself from `coordinate`, so it tracks the point instead of
              // the default mouse-offset behaviour.
              position={{ x: 0, y: 0 }}
              offset={0}
              wrapperStyle={{ outline: "none" }}
            />

            <Area
              type="monotone"
              dataKey="revenue"
              stroke={ACCENT}
              strokeWidth={2}
              fill="url(#rev-hatch)"
              dot={range === 7 ? <RingDot /> : false}
              activeDot={<ActiveRingDot />}
              animationDuration={700}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
