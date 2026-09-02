"use client";

import { useInView } from "./use-in-view";

/* Mobile hero dashboard — faithful build of the approved design:
   lavender backdrop → app window (chrome, greeting, 2 stat tiles,
   "This week" day pills + job chips) → floating "Invoice paid" toast. */

const DAYS = [
  { l: "M14" },
  { l: "T15" },
  { l: "W16", active: true },
  { l: "T17" },
  { l: "F18" },
];

const CHIPS = [
  { col: 1, name: "Nguyen", sub: "kitchen", av: "N", bg: "#e5d3f3", text: "#3c2a56", avBg: "#8f46d8" },
  { col: 2, name: "Ortiz", sub: "bath — tile", av: "O", bg: "#c8e2f7", text: "#14395c", avBg: "#1e9df2" },
  { col: 3, name: "Lee", sub: "roofing", av: "L", bg: "#f6caca", text: "#5d1616", avBg: "#e5484d" },
  { col: 5, name: "Chen", sub: "remodel", av: "C", bg: "#d8c5f1", text: "#33234e", avBg: "#8340d3" },
];

export function DashboardMobile() {
  const { ref, inView } = useInView<HTMLDivElement>(0.25);

  return (
    <div ref={ref} className="relative -mx-5 bg-white px-4 pb-14 pt-2 text-left">
      {/* App window */}
      <div className="overflow-hidden rounded-[22px] bg-white shadow-[0_20px_52px_-18px_rgb(74_68_118/0.28)] ring-1 ring-slate-200/70">
        {/* Browser chrome */}
        <div className="flex items-center gap-[7px] px-4 pb-3 pt-4">
          <span className="h-[11px] w-[11px] rounded-full bg-[#d4d4da]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#d4d4da]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#d4d4da]" />
          <span className="ml-2 flex h-9 flex-1 items-center justify-center rounded-full bg-[#ededf0] text-[13.5px] font-medium text-[#55565e]">
            app.jobflex.com<span className="text-[#a2a3ab]">/dashboard</span>
          </span>
        </div>

        {/* App nav */}
        <div className="flex items-center justify-between gap-2 px-4 pt-2">
          <span className="text-[19px] font-extrabold tracking-tight text-[#0f1013]">
            jobflex
          </span>
          <span className="relative pb-2.5 text-[12.5px] font-semibold text-[#0f1013]">
            Dashboard
            <span className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-[#4a4a9c]" />
          </span>
        </div>

        <div className="px-4 pb-9">
          {/* Greeting */}
          <div className="mt-6 flex items-baseline justify-between gap-2">
            <span className="whitespace-nowrap text-[18px] font-extrabold leading-tight tracking-[-0.01em] text-[#0f1013]">
              Good morning, Reyes &amp; Sons
            </span>
            <span className="shrink-0 text-[11.5px] font-medium text-[#9d9ea8]">Wed, Jul 16</span>
          </div>

          {/* Stats — plain text on white */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[13px] font-semibold text-[#3f4048]">July</div>
              <div className="mt-1.5 text-[31px] font-extrabold tracking-[-0.02em] text-[#0a0a0d]">
                $48,210
              </div>
              <div className="mt-1 flex items-center gap-1 text-[13.5px] font-semibold text-[#1c9448]">
                <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
                  <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                8% vs June
              </div>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[#3f4048]">Active jobs</div>
              <div className="mt-1.5 text-[31px] font-extrabold tracking-[-0.02em] text-[#0a0a0d]">
                12
              </div>
              <div className="mt-1 text-[13.5px] font-medium text-[#5f606a]">4 crews out</div>
            </div>
          </div>

          {/* This week */}
          <div className="mt-7">
            <span className="text-[21px] font-extrabold tracking-[-0.01em] text-[#0f1013]">
              This week
            </span>
          </div>

          {/* Day pills */}
          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {DAYS.map((d) => (
              <span
                key={d.l}
                className={`flex h-10 items-center justify-center rounded-full text-[13px] font-semibold ${
                  d.active ? "bg-[#0d0d10] text-white" : "bg-[#f0eff4] text-[#9a9ba6]"
                }`}
              >
                {d.l}
              </span>
            ))}
          </div>

          {/* Job chips */}
          <div className="mt-2.5 grid grid-cols-5 gap-1.5">
            {CHIPS.map((c) => (
              <div
                key={c.name}
                className="relative min-h-[50px] rounded-xl px-1.5 py-1.5"
                style={{ gridColumnStart: c.col, backgroundColor: c.bg, color: c.text }}
              >
                <div className="whitespace-nowrap text-[9.5px] font-bold leading-[1.4] tracking-[-0.02em]">
                  {c.name}
                </div>
                <div className="whitespace-nowrap text-[9.5px] font-medium leading-[1.4] tracking-[-0.02em] opacity-80">
                  {c.sub}
                </div>
                <span
                  className="absolute right-[3px] top-[3px] flex h-[15px] w-[15px] items-center justify-center rounded-full text-[7.5px] font-bold text-white"
                  style={{ backgroundColor: c.avBg }}
                >
                  {c.av}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating toast — overlaps the window's bottom-right corner */}
      <div
        className="absolute bottom-5 right-4 flex items-start gap-3 rounded-2xl bg-white py-3.5 pl-4 pr-6 shadow-[0_20px_48px_-12px_rgb(56_48_96/0.4)]"
        style={{
          opacity: inView ? 1 : 0,
          transform: inView ? "none" : "translateY(10px)",
          transition: "opacity .5s ease .5s, transform .55s cubic-bezier(.2,.6,.2,1) .5s",
        }}
      >
        <span className="mt-[1px] flex h-7 w-7 items-center justify-center rounded-full bg-[#17a34a]">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-white" aria-hidden>
            <path d="M3.5 8.5l3 3L12.5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span>
          <span className="block text-[16px] font-bold leading-tight text-[#101013]">
            Invoice paid
          </span>
          <span className="mt-0.5 block text-[15px] font-medium text-[#6f7079]">$2,400</span>
        </span>
      </div>
    </div>
  );
}
