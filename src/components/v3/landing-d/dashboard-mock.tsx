"use client";

import { DashboardMobile } from "./dashboard-mobile";
import { LogoMark } from "./logo";
import { useCountUp, useInView } from "./use-in-view";

const NAV = [
  { label: "Dashboard", active: true },
  { label: "Leads", count: "7" },
  { label: "Estimates", count: "12" },
  { label: "Proposals", count: "4" },
  { label: "Jobs", count: "24" },
  { label: "Schedule" },
  { label: "Invoices", count: "9" },
  { label: "Crew" },
  { label: "Reports" },
];

const RECENT_JOBS = [
  { name: "Nguyen kitchen remodel — week 3 of 5", meta: "Maple & quartz · $24,800", pct: 72 },
  { name: "Ortiz hall bath — tile & glass", meta: "Standard tier · $11,400", pct: 55 },
  { name: "Whitfield deck rebuild — 340 sq ft", meta: "Cedar · $16,900", pct: 38 },
  { name: "Kowalski basement — framing & drywall", meta: "Budget tier · $28,300", pct: 21 },
];

function Stat({
  label,
  value,
  prefix = "",
  suffix = "",
  delta,
  run,
  className = "",
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  delta: string;
  run: boolean;
  className?: string;
}) {
  const v = useCountUp(value, run);
  return (
    <div className={className}>
      <div className="text-[11px] font-medium text-white/40">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[26px] font-bold tracking-tight text-white">
          {prefix}
          {v.toLocaleString("en-US")}
          {suffix}
        </span>
        <span className="text-[11px] font-semibold text-lp-sky">{delta}</span>
      </div>
    </div>
  );
}

export function DashboardMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);

  return (
    <>
      {/* Mobile: Stripe-classic dashboard screenshot */}
      <div className="sm:hidden">
        <DashboardMobile />
      </div>

      <div
        ref={ref}
        className="hidden overflow-hidden rounded-2xl bg-lp-base text-left shadow-[0_40px_80px_-20px_rgb(15_23_42/0.45)] ring-1 ring-white/10 sm:block"
      >
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden w-[210px] shrink-0 flex-col border-r border-white/[0.06] px-4 py-5 md:flex">
          <div className="flex items-center justify-between px-2">
            <span className="flex items-center gap-2">
              <LogoMark className="h-6 w-6 text-white/10" />
              <span className="text-[15px] font-bold text-white">jobflex</span>
            </span>
            <svg viewBox="0 0 16 16" className="h-4 w-4 text-white/30" aria-hidden>
              <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <nav className="mt-6 space-y-0.5">
            {NAV.map((item) => (
              <div
                key={item.label}
                className={`flex items-center justify-between rounded-md px-2.5 py-[7px] text-[13px] font-medium ${
                  item.active ? "bg-white/[0.08] text-white" : "text-white/45"
                }`}
              >
                {item.label}
                {item.count && (
                  <span className="text-[10px] font-semibold text-white/25">{item.count}</span>
                )}
              </div>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 px-2 pt-8">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-[11px] font-bold text-white">
              R
            </span>
            <div>
              <div className="text-[12px] font-semibold text-white/90">Reyes & Sons</div>
              <div className="text-[10px] text-white/35">Remodeling · 6 crew</div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="min-w-0 flex-1 px-5 py-5 sm:px-7">
          <div className="flex items-center justify-between">
            <span className="text-[17px] font-bold text-white">Dashboard</span>
            <span className="rounded-md bg-white/[0.07] px-2.5 py-1 text-[11px] font-medium text-white/50">
              Last 30 days ⌄
            </span>
          </div>

          {/* Stat row — two essentials on mobile, all three from sm up */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-b border-white/[0.06] pb-5 sm:grid-cols-3 sm:gap-6">
            <Stat label="Active jobs" value={24} delta="+3" run={inView} />
            <Stat label="Pipeline value" value={186400} prefix="$" delta="+$12,400" run={inView} className="hidden sm:block" />
            <Stat label="Collected this month" value={96834} prefix="$" delta="+8%" run={inView} />
          </div>

          {/* Big cash-flow chart */}
          <div className="mt-5">
            <div className="flex items-center gap-4 text-[11px] font-medium">
              <span className="text-white/80">Cash flow</span>
              <span className="text-white/30">Invoiced</span>
              <span className="text-white/30">Collected</span>
            </div>
            <svg viewBox="0 0 900 220" className="mt-3 w-full" aria-hidden>
              <defs>
                <linearGradient id="dashArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1854A0" stopOpacity="0.55" />
                  <stop offset="60%" stopColor="#4A9EFF" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="#4A9EFF" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="dashLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1854A0" />
                  <stop offset="100%" stopColor="#4A9EFF" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => (
                <line key={i} x1={i * 82 + 8} y1="0" x2={i * 82 + 8} y2="204" stroke="#ffffff" strokeOpacity="0.04" />
              ))}
              <path
                d="M0 190 L60 172 L120 178 L180 140 L240 150 L300 96 L360 118 L420 60 L480 92 L540 40 L600 70 L660 30 L720 84 L780 52 L840 66 L900 24 L900 220 L0 220 Z"
                fill="url(#dashArea)"
                style={{
                  opacity: inView ? 1 : 0,
                  transition: "opacity 1.2s cubic-bezier(.2,.6,.2,1) .35s",
                }}
              />
              <path
                d="M0 190 L60 172 L120 178 L180 140 L240 150 L300 96 L360 118 L420 60 L480 92 L540 40 L600 70 L660 30 L720 84 L780 52 L840 66 L900 24"
                fill="none"
                stroke="url(#dashLine)"
                strokeWidth="2.5"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={inView ? 0 : 1}
                style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(.2,.6,.2,1) .15s" }}
              />
              <path
                d="M0 200 L90 194 L180 197 L270 176 L360 184 L450 158 L540 168 L630 138 L720 152 L810 128 L900 136"
                fill="none"
                stroke="#38bdf8"
                strokeOpacity="0.5"
                strokeWidth="1.5"
                strokeDasharray="3 5"
              />
            </svg>
          </div>

          {/* Mini modules — desktop density, hidden on the mobile snapshot */}
          <div className="mt-5 hidden grid-cols-3 gap-6 border-t border-white/[0.06] pt-5 sm:grid">
            <div>
              <div className="text-[11px] text-white/40">Avg job size</div>
              <div className="mt-1 text-[20px] font-bold text-white">$21,850</div>
              <svg viewBox="0 0 160 40" className="mt-2 w-full" aria-hidden>
                <path
                  d="M0 32 L20 28 L40 30 L60 20 L80 24 L100 12 L120 18 L140 8 L160 12"
                  fill="none"
                  stroke="#4A9EFF"
                  strokeWidth="2"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={inView ? 0 : 1}
                  style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(.2,.6,.2,1) .6s" }}
                />
              </svg>
            </div>
            <div>
              <div className="text-[11px] text-white/40">Crew hours this week</div>
              <div className="mt-1 text-[20px] font-bold text-white">248</div>
              <div className="mt-2 flex h-[40px] items-end gap-[3px]">
                {[14, 22, 9, 28, 18, 32, 12, 26, 20, 34, 16, 24, 30, 11, 27, 19, 33, 15, 23, 29].map(
                  (h, i) => (
                    <span
                      key={i}
                      className="w-full rounded-sm bg-sky-400/70"
                      style={{
                        height: inView ? `${h}px` : "3px",
                        transition: `height .7s cubic-bezier(.2,.6,.2,1) ${0.5 + i * 0.03}s`,
                      }}
                    />
                  )
                )}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-white/40">Estimate win rate</div>
              <div className="mt-1 text-[20px] font-bold text-white">
                68<span className="text-[14px] text-white/50">%</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {[
                  { l: "Won", w: 68, c: "bg-lp-blue" },
                  { l: "Open", w: 22, c: "bg-white/30" },
                  { l: "Lost", w: 10, c: "bg-white/10" },
                ].map((r, i) => (
                  <div key={r.l} className="flex items-center gap-2">
                    <span className="w-7 text-[10px] text-white/35">{r.l}</span>
                    <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <span
                        className={`block h-full rounded-full ${r.c}`}
                        style={{
                          width: inView ? `${r.w}%` : "0%",
                          transition: `width .9s cubic-bezier(.2,.6,.2,1) ${0.7 + i * 0.12}s`,
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent jobs */}
          <div className="mt-5 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between text-[11px] font-medium">
              <span className="text-white/80">Recent jobs</span>
              <span className="text-white/30">View all →</span>
            </div>
            <div className="mt-2">
              {RECENT_JOBS.map((j, i) => (
                <div
                  key={j.name}
                  className={`items-center justify-between gap-6 border-b border-white/[0.04] py-[9px] last:border-0 ${
                    i > 1 ? "hidden sm:flex" : "flex"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-white/85">{j.name}</div>
                    <div className="text-[11px] text-white/30">{j.meta}</div>
                  </div>
                  <div className="hidden w-40 shrink-0 items-center gap-2 sm:flex">
                    <span className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <span
                        className="block h-full rounded-full bg-gradient-to-r from-lp-blue to-lp-sky"
                        style={{
                          width: inView ? `${j.pct}%` : "0%",
                          transition: "width 1s cubic-bezier(.2,.6,.2,1) .8s",
                        }}
                      />
                    </span>
                    <span className="w-8 text-right text-[11px] text-white/40">{j.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
