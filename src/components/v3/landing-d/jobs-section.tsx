"use client";

import { CalendarMobile } from "./calendar-mobile";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

type Event = { day: number; span: number; label: string; cls: string };

const DAYS = [
  { d: "MON", n: 14 },
  { d: "TUE", n: 15 },
  { d: "WED", n: 16, today: true },
  { d: "THU", n: 17 },
  { d: "FRI", n: 18 },
];

const CREW: { name: string; role: string; hue: string; events: Event[] }[] = [
  {
    name: "Marco",
    role: "Lead carpenter",
    hue: "from-lp-blue to-lp-blueDark",
    events: [
      { day: 1, span: 2, label: "Nguyen kitchen — cabinet install", cls: "bg-blue-100 text-blue-800" },
      { day: 4, span: 1, label: "Counter template", cls: "bg-blue-100 text-blue-800" },
      { day: 5, span: 1, label: "Nguyen — punch walk", cls: "bg-blue-50 text-blue-600" },
    ],
  },
  {
    name: "Sam",
    role: "Tile & finish",
    hue: "from-sky-500 to-blue-700",
    events: [
      { day: 1, span: 1, label: "Ortiz bath — waterproofing", cls: "bg-sky-100 text-sky-700" },
      { day: 2, span: 2, label: "Ortiz bath — tile set", cls: "bg-sky-100 text-sky-700" },
    ],
  },
  {
    name: "Rosa",
    role: "Drywall & paint",
    hue: "from-emerald-500 to-teal-700",
    events: [
      { day: 3, span: 1, label: "Kowalski — hang drywall", cls: "bg-emerald-100 text-emerald-700" },
    ],
  },
  {
    name: "Dmitri",
    role: "Apprentice",
    hue: "from-amber-500 to-orange-700",
    events: [
      { day: 2, span: 1, label: "Baptiste — walk-through", cls: "bg-amber-100 text-amber-700" },
      { day: 3, span: 1, label: "City inspection @ 10:30", cls: "bg-rose-100 text-rose-700" },
      { day: 4, span: 1, label: "Supply run — Kowalski", cls: "bg-slate-100 text-slate-600" },
    ],
  },
];

const TOGGLES: [string, boolean][] = [
  ["Text crew the address", true],
  ["Morning reminders", true],
  ["Client updates", false],
];

export function JobsSection() {
  const { ref, inView } = useInView<HTMLDivElement>(0.15);

  let chipIndex = 0;

  return (
    <section className="relative overflow-hidden bg-white px-5 py-[8vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-eyebrow hidden text-slate-500 sm:block">Run your business</h2>
          <p className="text-[30px] font-bold leading-[1.08] tracking-[-0.02em] text-lp-ink sm:mt-5 sm:text-[clamp(36px,4.4vw,64px)] sm:leading-[1.02]">
            <span className="sm:hidden">Assign jobs to your team in the calendar.</span>
            <span className="hidden sm:inline">Schedule the whole crew.</span>
          </p>
        </Reveal>

        {/* Mobile: flagship crew calendar */}
        <Reveal delay={100} className="mt-8 sm:hidden">
          <CalendarMobile />
        </Reveal>

        <Reveal delay={120} className="relative mt-14 hidden sm:block">
          <div ref={ref} className="rounded-xl bg-white p-5 shadow-lp-mock ring-1 ring-slate-100 sm:p-9">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-[26px] font-bold tracking-tight text-lp-ink">Schedule</div>
              <span className="rounded-md bg-lp-blue px-3.5 py-1.5 text-[12.5px] font-bold text-white">
                Schedule job
              </span>
            </div>

            {/* Day header */}
            <div className="mt-6 hidden grid-cols-[7rem_repeat(5,1fr)] gap-0 border-b border-slate-100 pb-2 sm:grid">
              <span aria-hidden />
              {DAYS.map((day) => (
                <span
                  key={day.d}
                  className={`flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-wide ${
                    day.today ? "text-lp-ink" : "text-slate-400"
                  }`}
                >
                  {day.today && <span className="h-1.5 w-1.5 rounded-full bg-lp-blue" />}
                  {day.d} {day.n}
                </span>
              ))}
            </div>

            {/* Crew rows */}
            <div className="hidden sm:block">
              {CREW.map((c) => (
                <div
                  key={c.name}
                  className="grid grid-cols-[7rem_repeat(5,1fr)] items-stretch border-b border-slate-50 last:border-0"
                >
                  {/* crew cell */}
                  <div className="flex items-center gap-2.5 py-3 pr-2">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-bold text-white ${c.hue}`}
                    >
                      {c.name[0]}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-bold text-lp-ink">{c.name}</div>
                      <div className="truncate text-[10.5px] text-slate-400">{c.role}</div>
                    </div>
                  </div>
                  {/* week lane */}
                  <div className="col-span-5 grid grid-cols-5">
                    {DAYS.map((day, di) => (
                      <span
                        key={day.d}
                        className={`border-l border-slate-50 ${day.today ? "bg-slate-50/60" : ""}`}
                        style={{ gridColumn: di + 1, gridRow: 1 }}
                      />
                    ))}
                    {c.events.map((e) => {
                      const i = chipIndex++;
                      return (
                        <span
                          key={e.label}
                          className={`z-10 my-2.5 mr-1.5 flex items-center truncate rounded-md px-2.5 text-[11px] font-semibold leading-none ${e.cls}`}
                          style={{
                            gridColumn: `${e.day} / span ${e.span}`,
                            gridRow: 1,
                            marginLeft: 6,
                            minHeight: 30,
                            opacity: inView ? 1 : 0,
                            transform: inView ? "none" : "scale(.92)",
                            transition: `opacity .45s cubic-bezier(.2,.6,.2,1) ${200 + i * 90}ms, transform .45s cubic-bezier(.2,.6,.2,1) ${200 + i * 90}ms`,
                          }}
                        >
                          <span className="truncate">{e.label}</span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* Overlapping dispatch card */}
          <div className="z-20 mt-6 rounded-2xl bg-white p-6 shadow-lp-card ring-1 ring-slate-100 lg:absolute lg:-bottom-14 lg:right-8 lg:mt-0 lg:w-[19.5rem]">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-bold text-lp-ink">Workers</span>
            </div>
            <div className="mt-4">
              <div className="text-[19px] font-bold tracking-tight text-lp-ink">
                Whitfield deck rebuild
              </div>
            </div>
            <div className="mt-5 text-[10px] font-bold tracking-[1.2px] text-slate-400">
              ASSIGN TO
            </div>
            <div className="mt-2.5 flex items-center gap-2.5">
              {CREW.map((c, i) => (
                <span
                  key={c.name}
                  className={`relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br text-[12px] font-bold text-white ${c.hue} ${
                    i === 0 ? "ring-2 ring-lp-ink ring-offset-2" : "opacity-45"
                  }`}
                >
                  {c.name[0]}
                  {i === 0 && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-lp-ink ring-2 ring-white">
                      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-white" aria-hidden>
                        <path d="M3.5 8.5l3 3L12.5 5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                </span>
              ))}
            </div>
            <div className="mt-5 divide-y divide-slate-50 border-t border-slate-50">
              {TOGGLES.map(([label, on], i) => (
                <div key={label} className="flex items-center justify-between py-2.5">
                  <span className="text-[13.5px] font-semibold text-lp-ink">{label}</span>
                  <span
                    className={`toggle ${on && inView ? "on" : ""}`}
                    style={{ transitionDelay: `${700 + i * 220}ms` }}
                  />
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
