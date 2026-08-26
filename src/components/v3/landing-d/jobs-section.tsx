"use client";

import { PhoneSchedule } from "./blueprint-phone";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

/* The crew schedule, drawn in the app's blueprint language rather than the
   donor's soft app card: drafting paper, 2px ink frames, square crew plates and
   bordered job chips whose tone is the job's state — status colour for status
   only, never decoration. */

type Tone = "bp" | "sky" | "ok" | "warn" | "bad" | "mute";
type Event = { day: number; span: number; label: string; tone: Tone };

const DAYS = [
  { d: "Mon", n: 14 },
  { d: "Tue", n: 15 },
  { d: "Wed", n: 16, today: true },
  { d: "Thu", n: 17 },
  { d: "Fri", n: 18 },
];

const CREW: { name: string; role: string; events: Event[] }[] = [
  {
    name: "Marco",
    role: "Lead carpenter",
    events: [
      { day: 1, span: 2, label: "Nguyen kitchen — cabinet install", tone: "bp" },
      { day: 4, span: 1, label: "Counter template", tone: "bp" },
      { day: 5, span: 1, label: "Nguyen — punch walk", tone: "sky" },
    ],
  },
  {
    name: "Sam",
    role: "Tile & finish",
    events: [
      { day: 1, span: 1, label: "Ortiz bath — waterproofing", tone: "sky" },
      { day: 2, span: 2, label: "Ortiz bath — tile set", tone: "sky" },
    ],
  },
  {
    name: "Rosa",
    role: "Drywall & paint",
    events: [{ day: 3, span: 1, label: "Kowalski — hang drywall", tone: "ok" }],
  },
  {
    name: "Dmitri",
    role: "Apprentice",
    events: [
      { day: 2, span: 1, label: "Baptiste — walk-through", tone: "warn" },
      { day: 3, span: 1, label: "City inspection @ 10:30", tone: "bad" },
      { day: 4, span: 1, label: "Supply run — Kowalski", tone: "mute" },
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
    <section className="relative overflow-hidden bg-white px-5 py-[8vmin] sm:px-6 lg:pb-[11rem]">
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
          <PhoneSchedule />
        </Reveal>

        <Reveal delay={120} className="relative mt-14 hidden sm:block">
          <div ref={ref} className="lp-jb">
            <div className="lp-jb-head">
              <span className="lp-jb-title">Schedule</span>
              <span className="lp-jb-tag">Aug 14 — 18</span>
              <span className="lp-jb-btn">Schedule job</span>
            </div>

            {/* Day header */}
            <div className="lp-jb-days">
              <span aria-hidden />
              {DAYS.map((day) => (
                <span key={day.d} className={`lp-jb-day${day.today ? " is-today" : ""}`}>
                  <span className="lp-jb-day-d">{day.d}</span>
                  <span className="lp-jb-day-n">{day.n}</span>
                </span>
              ))}
            </div>

            {/* Crew rows */}
            {CREW.map((c) => (
              <div key={c.name} className="lp-jb-row">
                <div className="lp-jb-crew">
                  <span className="lp-jb-av">{c.name[0]}</span>
                  <span className="lp-jb-crew-txt">
                    <span className="lp-jb-crew-name">{c.name}</span>
                    <span className="lp-jb-crew-role">{c.role}</span>
                  </span>
                </div>
                <div className="lp-jb-lane">
                  {DAYS.map((day, di) => (
                    <span
                      key={day.d}
                      className={`lp-jb-cell${day.today ? " is-today" : ""}`}
                      style={{ gridColumn: di + 1, gridRow: 1 }}
                    />
                  ))}
                  {c.events.map((e) => {
                    const i = chipIndex++;
                    return (
                      <span
                        key={e.label}
                        className={`lp-jb-chip tone-${e.tone}`}
                        style={{
                          gridColumn: `${e.day} / span ${e.span}`,
                          gridRow: 1,
                          opacity: inView ? 1 : 0,
                          transform: inView ? "none" : "translateY(4px)",
                          transition: `opacity .4s cubic-bezier(.22,.61,.36,1) ${200 + i * 80}ms, transform .4s cubic-bezier(.22,.61,.36,1) ${200 + i * 80}ms`,
                        }}
                      >
                        {e.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Overlapping dispatch card */}
          <div className="lp-jb-dispatch">
            <div className="lp-jb-dispatch-head">
              <span className="lp-jb-card-title">Workers</span>
              <span className="lp-jb-tag">Unassigned</span>
            </div>
            <div className="lp-jb-dispatch-job">Whitfield deck rebuild</div>
            <div className="lp-jb-dispatch-lbl">Assign to</div>
            <div className="lp-jb-avrow">
              {CREW.map((c, i) => (
                <span key={c.name} className={`lp-jb-av${i === 0 ? " is-picked" : " is-dim"}`}>
                  {c.name[0]}
                  {i === 0 && <span className="lp-jb-av-tick" aria-hidden>✓</span>}
                </span>
              ))}
            </div>
            <div className="lp-jb-toggles">
              {TOGGLES.map(([label, on], i) => (
                <div key={label} className="lp-jb-toggle-row">
                  <span>{label}</span>
                  <span
                    className={`lp-toggle ${on && inView ? "on" : ""}`}
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
