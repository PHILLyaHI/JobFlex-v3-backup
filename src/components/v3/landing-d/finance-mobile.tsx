"use client";

import { AppWindow } from "./app-window";
import { useCountUp, useInView } from "./use-in-view";

/* ---- Cash flow analytics screenshot ---- */

const MONTHS = [
  { m: "Feb", inn: 34, out: 22 },
  { m: "Mar", inn: 42, out: 30 },
  { m: "Apr", inn: 38, out: 26 },
  { m: "May", inn: 52, out: 34 },
  { m: "Jun", inn: 47, out: 36 },
  { m: "Jul", inn: 61, out: 38 },
];

const OUTSTANDING = [
  { who: "Nguyen kitchen · #1042", amt: "$6,400", due: "Due Fri", tone: "bg-amber-50 text-amber-700 ring-amber-200" },
  { who: "Ortiz bath · #1039", amt: "$3,200", due: "Sent", tone: "bg-lp-paper text-slate-500 ring-slate-200" },
  { who: "Whitfield deck · #1031", amt: "$2,800", due: "8 days late", tone: "bg-rose-50 text-rose-600 ring-rose-200" },
];

export function CashflowMobile() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const inTotal = useCountUp(148290, inView);

  return (
    <div ref={ref}>
      <AppWindow title="app.jobflex.com/reports/cash-flow">
        <div className="px-4 py-4">
          <div className="text-[13.5px] font-bold text-lp-ink">Cash flow</div>

          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <div className="text-[11px] font-medium text-slate-400">Money in</div>
              <div className="text-[27px] font-extrabold tracking-tight text-lp-ink">
                ${inTotal.toLocaleString("en-US")}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-slate-400">Money out</div>
              <div className="text-[27px] font-extrabold tracking-tight text-slate-400">$96,410</div>
            </div>
            <span className="mb-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              +$51,880 net
            </span>
          </div>

          {/* Grouped bars */}
          <div className="mt-4 flex items-end justify-between gap-2 border-b border-slate-100 pb-2">
            {MONTHS.map((mo, i) => (
              <div key={mo.m} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-[76px] w-full items-end justify-center gap-[3px]">
                  <span
                    className="w-[9px] rounded-t-sm bg-lp-blurple"
                    style={{
                      height: inView ? `${mo.inn}px` : "3px",
                      transition: `height .7s cubic-bezier(.2,.6,.2,1) ${0.15 + i * 0.07}s`,
                    }}
                  />
                  <span
                    className="w-[9px] rounded-t-sm bg-slate-200"
                    style={{
                      height: inView ? `${mo.out}px` : "3px",
                      transition: `height .7s cubic-bezier(.2,.6,.2,1) ${0.2 + i * 0.07}s`,
                    }}
                  />
                </div>
                <span className="text-[9px] font-medium text-slate-400">{mo.m}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[9.5px] font-medium text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-lp-blurple" /> Collected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm bg-slate-200" /> Spent
            </span>
          </div>

          {/* Outstanding invoices */}
          <div className="mt-4">
            <div className="space-y-1.5">
              {OUTSTANDING.map((o) => (
                <div key={o.who} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
                  <span className="truncate text-[11.5px] text-slate-600">{o.who}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-[12px] font-bold text-lp-ink">{o.amt}</span>
                    <span className={`rounded-full px-2 py-[3px] text-[9px] font-bold ring-1 ${o.tone}`}>
                      {o.due}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppWindow>
    </div>
  );
}

/* ---- Change order — a delta added to an existing job ---- */

export function ChangeOrderMobile() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref}>
      <AppWindow title="app.jobflex.com/jobs/nguyen-kitchen">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-bold text-lp-ink">Nguyen kitchen remodel</div>
              <div className="text-[10.5px] text-slate-400">Signed contract · $27,860</div>
            </div>
            <span className="rounded-full bg-lp-paper px-2.5 py-1 text-[9.5px] font-bold text-slate-500 ring-1 ring-slate-200">
              CHANGE ORDER #3
            </span>
          </div>

          <div className="mt-3.5 space-y-[6px]">
            {[
              ["Cabinets — maple shaker", "$8,400"],
              ["Countertop — quartz, 42 sf", "$2,436"],
            ].map(([l, r]) => (
              <div key={l} className="flex justify-between rounded-md bg-lp-paper px-3 py-2 text-[11.5px] text-slate-400">
                <span>{l}</span>
                <span className="font-semibold">{r}</span>
              </div>
            ))}
            {/* the added line */}
            <div
              className="flex items-center justify-between rounded-md bg-white px-3 py-2.5 ring-2 ring-lp-blurple"
              style={{
                opacity: inView ? 1 : 0,
                transform: inView ? "none" : "translateY(6px)",
                transition: "opacity .5s ease .5s, transform .5s cubic-bezier(.2,.6,.2,1) .5s",
              }}
            >
              <span className="flex items-center gap-2 text-[12px] font-semibold text-lp-ink">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-lp-blurple text-[10px] font-bold text-white">
                  +
                </span>
                Recessed lighting ×6, dimmer
              </span>
              <span className="text-[12.5px] font-bold text-lp-blurple">+$1,240</span>
            </div>
          </div>

          <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-3">
            <span
              className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200"
              style={{ opacity: inView ? 1 : 0, transition: "opacity .4s ease 1.1s" }}
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                <path d="M3 8.5l3.2 3L13 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Approved by M. Nguyen · today 2:14p
            </span>
            <span className="text-right">
              <span className="block text-[9.5px] text-slate-400">New total</span>
              <span className="text-[15px] font-bold tracking-tight text-lp-ink">$29,100</span>
            </span>
          </div>
        </div>
      </AppWindow>
    </div>
  );
}
