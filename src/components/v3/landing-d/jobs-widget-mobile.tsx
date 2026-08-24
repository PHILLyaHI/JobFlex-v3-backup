"use client";

import { AppWindow } from "./app-window";
import { useInView } from "./use-in-view";

/* Strictly black-and-white jobs board — cost + a clear scheduling affordance */

const JOBS = [
  { name: "Nguyen kitchen remodel", who: "Minh Nguyen · 418 Alder St", amt: "$27,860", status: "IN PROGRESS", fill: true },
  { name: "Ortiz hall bath", who: "Carla Ortiz · 92 Birchwood Dr", amt: "$11,400", status: "SCHEDULED", fill: false },
  { name: "Harmon powder room", who: "Lena Harmon · 7 Crestline Ct", amt: "$8,400", status: "PAID", fill: false, muted: true },
];

const WEEK = ["Mon 21", "Tue 22", "Wed 23", "Thu 24", "Fri 25"];

export function JobsWidgetMobile() {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);

  return (
    <div ref={ref}>
      <AppWindow title="app.jobflex.com/jobs">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="text-[13.5px] font-bold text-lp-ink">Jobs</span>
          <span className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
            This month ⌄
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {JOBS.map((j) => (
            <div key={j.name} className={`px-4 py-3 ${j.muted ? "opacity-55" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold text-lp-ink">{j.name}</div>
                  <div className="truncate text-[10.5px] text-slate-400">{j.who}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-bold tracking-tight text-lp-ink">{j.amt}</div>
                  <span
                    className={`inline-block rounded px-1.5 py-[2px] text-[8.5px] font-bold tracking-wide ${
                      j.fill ? "bg-lp-ink text-white" : "border border-slate-300 text-slate-500"
                    }`}
                  >
                    {j.status}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {/* Job mid-scheduling — the affordance, expanded */}
          <div className="bg-lp-paper px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-bold text-lp-ink">Whitfield deck rebuild</div>
                <div className="truncate text-[10.5px] text-slate-400">Gwen Whitfield · 15 Overlook Rd</div>
              </div>
              <div className="shrink-0 text-[14px] font-bold tracking-tight text-lp-ink">$16,900</div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[10.5px] font-semibold text-slate-500">Schedule →</span>
              <div className="flex flex-1 gap-1.5">
                {WEEK.map((d, i) => (
                  <button
                    key={d}
                    type="button"
                    className={`h-9 flex-1 rounded-md text-[10px] font-bold transition-all duration-300 ${
                      i === 0 && inView
                        ? "bg-lp-ink text-white"
                        : "border border-slate-300 bg-white text-slate-500"
                    }`}
                    style={i === 0 ? { transitionDelay: "600ms" } : undefined}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div
              className="mt-2.5 flex items-center gap-1.5 text-[10.5px] font-semibold text-lp-ink"
              style={{ opacity: inView ? 1 : 0, transition: "opacity .4s ease 1s" }}
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path d="M3 8.5l3.2 3L13 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Crew notified — starts Monday 8:00a
            </div>
          </div>
        </div>
      </AppWindow>
    </div>
  );
}
