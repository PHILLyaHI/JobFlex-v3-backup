"use client";

import { AppWindow } from "./app-window";
import { useInView } from "./use-in-view";

const DAYS = [
  { d: "Mon", n: 14 },
  { d: "Tue", n: 15 },
  { d: "Wed", n: 16, today: true },
  { d: "Thu", n: 17 },
  { d: "Fri", n: 18 },
];

type Ev = {
  day: number;
  span: number;
  title: string;
  time: string;
  tone: string;
  crew: { ch: string; bg: string }[];
  target?: boolean; // drop target for the mid-drag avatar
};

const EVENTS: Ev[][] = [
  // lane 1
  [
    { day: 1, span: 2, title: "Nguyen kitchen — cabinets", time: "8:00a", tone: "bg-indigo-50 ring-indigo-200 text-indigo-900", crew: [{ ch: "M", bg: "bg-indigo-500" }, { ch: "J", bg: "bg-violet-500" }] },
    { day: 4, span: 2, title: "Whitfield deck — footings", time: "8:30a", tone: "bg-white ring-slate-300 text-lp-ink", crew: [{ ch: "M", bg: "bg-indigo-500" }], target: true },
  ],
  // lane 2
  [
    { day: 1, span: 1, title: "Ortiz bath — waterproof", time: "9:00a", tone: "bg-sky-50 ring-sky-200 text-sky-900", crew: [{ ch: "S", bg: "bg-sky-500" }] },
    { day: 3, span: 2, title: "Kowalski — tape & mud", time: "7:30a", tone: "bg-emerald-50 ring-emerald-200 text-emerald-900", crew: [{ ch: "R", bg: "bg-emerald-600" }] },
    { day: 5, span: 1, title: "Harmon — punch list", time: "1:00p", tone: "bg-slate-100 ring-slate-200 text-slate-700", crew: [{ ch: "S", bg: "bg-sky-500" }] },
  ],
];

export function CalendarMobile() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  return (
    <div ref={ref}>
      <AppWindow title="app.jobflex.com/schedule">
        {/* Toolbar */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <span className="text-[13.5px] font-bold text-lp-ink">Schedule</span>
          <span className="flex items-center gap-1 rounded-md bg-lp-paper px-1 py-[3px] text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
            <span className="px-1.5">‹</span>
            <span className="text-lp-ink">Jul 14 – 18</span>
            <span className="px-1.5">›</span>
          </span>
        </div>

        <div className="relative px-3 pb-4 pt-3">
          {/* Day headers */}
          <div className="grid grid-cols-5 gap-1 text-center">
            {DAYS.map((d) => (
              <div
                key={d.n}
                className={`rounded-md py-1.5 text-[10px] font-semibold leading-tight ${
                  d.today ? "bg-lp-ink text-white" : "text-slate-400"
                }`}
              >
                {d.d}
                <span className={`block text-[12px] ${d.today ? "text-white" : "text-lp-ink"}`}>{d.n}</span>
              </div>
            ))}
          </div>

          {/* Lanes */}
          <div className="mt-2 space-y-1.5">
            {EVENTS.map((lane, li) => (
              <div key={li} className="relative grid min-h-[54px] grid-cols-5 gap-1">
                {DAYS.map((d, di) => (
                  <span
                    key={d.n}
                    className={`rounded-md ${d.today ? "bg-lp-paper" : ""}`}
                    style={{ gridColumn: di + 1, gridRow: 1 }}
                  />
                ))}
                {lane.map((e, ei) => (
                  <div
                    key={e.title}
                    className={`relative z-10 flex flex-col justify-center rounded-lg px-2 py-1.5 ring-1 ${e.tone} ${
                      e.target ? "ring-2 ring-dashed ring-lp-blurple" : ""
                    }`}
                    style={{
                      gridColumn: `${e.day} / span ${e.span}`,
                      gridRow: 1,
                      opacity: inView ? 1 : 0,
                      transform: inView ? "none" : "scale(.94)",
                      transition: `opacity .45s cubic-bezier(.2,.6,.2,1) ${0.2 + (li * 2 + ei) * 0.08}s, transform .45s cubic-bezier(.2,.6,.2,1) ${0.2 + (li * 2 + ei) * 0.08}s`,
                    }}
                  >
                    <span className="truncate text-[9px] font-bold leading-[1.3]">{e.title}</span>
                    <span className="text-[8px] font-medium opacity-60">{e.time}</span>
                    <span className="absolute -bottom-1.5 right-1 flex">
                      {e.crew.map((c, i) => (
                        <span
                          key={i}
                          className={`flex h-4 w-4 items-center justify-center rounded-full text-[7.5px] font-bold text-white ring-2 ring-white ${c.bg} ${i > 0 ? "-ml-1" : ""}`}
                        >
                          {c.ch}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Mid-drag: Dmitri being dropped onto Whitfield deck (lane 1, Thu-Fri) */}
          <div
            className="pointer-events-none absolute right-[13%] top-[64px] z-20"
            style={{
              opacity: inView ? 1 : 0,
              transform: inView ? "rotate(-6deg)" : "rotate(-6deg) translateY(-14px)",
              transition: "opacity .5s ease .9s, transform .6s cubic-bezier(.2,.6,.2,1) .9s",
            }}
          >
            <div className="flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 shadow-[0_10px_24px_-6px_rgb(15_23_42/0.35)] ring-1 ring-slate-200">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                D
              </span>
              <span className="text-[10px] font-semibold text-lp-ink">Dmitri</span>
            </div>
            {/* cursor */}
            <svg viewBox="0 0 16 16" className="absolute -bottom-3 right-0 h-4 w-4" aria-hidden>
              <path d="M3 1l10 5.6-4.6 1.2L11 13l-2.2 1-2.5-5L3 12V1z" fill="#0f172a" stroke="#fff" strokeWidth="1" />
            </svg>
          </div>
        </div>
      </AppWindow>
    </div>
  );
}
