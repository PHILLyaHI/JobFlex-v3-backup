"use client";

import { CashflowMobile, ChangeOrderMobile } from "./finance-mobile";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

function CashflowCards() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref} className="relative mx-auto max-w-[32rem] py-8">
      {/* line chart card */}
      <div className="w-[78%] rounded-xl bg-gradient-to-b from-violet-50 to-white p-5 shadow-lp-card ring-1 ring-slate-100">
        <div className="text-[13px] font-bold text-lp-grape">Revenue</div>
        <div className="text-[26px] font-bold tracking-tight text-lp-ink">
          +24%{" "}
          <span className="text-[13px] font-semibold text-slate-400">vs last quarter</span>
        </div>
        <svg viewBox="0 0 300 90" className="mt-3 w-full" aria-hidden>
          {[0, 60, 120, 180, 240, 300].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="84" stroke="#7c3aed" strokeOpacity="0.06" />
          ))}
          <path
            d="M0 74 C40 66 54 48 84 52 C118 56 130 30 162 34 C196 38 210 16 244 22 C266 26 284 12 300 8"
            fill="none"
            stroke="url(#cfLine)"
            strokeWidth="2.5"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={inView ? 0 : 1}
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(.2,.6,.2,1) .2s" }}
          />
          <defs>
            <linearGradient id="cfLine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#7c3aed" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* donut card */}
      <div className="absolute -bottom-2 left-0 w-[46%] rounded-xl bg-white p-4 shadow-lp-card ring-1 ring-slate-100">
        <div className="flex items-center gap-3.5">
          <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
            <circle cx="32" cy="32" r="24" fill="none" stroke="#f1f5f9" strokeWidth="12" />
            <circle
              cx="32" cy="32" r="24" fill="none" stroke="#f59e0b" strokeWidth="12"
              strokeDasharray="150.8"
              strokeDashoffset={inView ? 150.8 * (1 - 0.18) : 150.8}
              style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.6,.2,1) .7s" }}
            />
            <circle
              cx="32" cy="32" r="24" fill="none" stroke="#7c3aed" strokeWidth="12"
              strokeDasharray="150.8"
              strokeDashoffset={inView ? 150.8 * (1 - 0.82) : 150.8}
              style={{
                transition: "stroke-dashoffset 1.2s cubic-bezier(.2,.6,.2,1) .4s",
                transformOrigin: "center",
                transform: "rotate(64.8deg)",
              }}
            />
          </svg>
          <div>
            <div className="text-[17px] font-bold text-lp-ink">Paid</div>
            <div className="text-[11px] leading-tight text-slate-400">
              82% collected
              <br />
              18% outstanding
            </div>
          </div>
        </div>
      </div>

      {/* KPI pill */}
      <div className="absolute -right-1 bottom-8 flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-lp-card ring-1 ring-slate-100">
        <span className="cursor-default text-[14px]" aria-hidden>
          ▲
        </span>
        <span className="text-[14px] font-bold text-lp-ink">+18% collected this week</span>
      </div>
    </div>
  );
}

function ChangeOrderMock() {
  const { ref } = useInView<HTMLDivElement>(0.4);
  return (
    <div ref={ref} className="relative mx-auto max-w-[28rem] py-8">
      <div className="rounded-xl bg-white p-6 shadow-lp-card ring-1 ring-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-lp-ink">Change order #3</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
            NGUYEN KITCHEN
          </span>
        </div>
        <div className="mt-4 text-[15px] font-semibold text-lp-ink">
          Add recessed lighting — 6 cans, dimmer
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
          Requested during Tuesday walkthrough. Includes fixtures, wiring,
          patch &amp; paint. Two added days on the schedule.
        </p>
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-[22px] font-bold tracking-tight text-lp-ink">+$1,240</span>
          <span className="font-serif text-[19px] italic text-slate-500">M. Nguyen</span>
        </div>
      </div>
    </div>
  );
}

export function FlowFeatures() {
  return (
    <section className="relative overflow-hidden bg-white px-5 pb-[8vmin] pt-[6vmin] max-sm:pb-[18vmin] max-sm:pt-[16vmin] sm:px-6 lg:pt-[10vmin]">
      <div className="mx-auto lp-wrap">
        {/* Cash flow — text leads on mobile */}
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <Reveal className="order-2 hidden sm:block lg:order-1">
            <CashflowCards />
          </Reveal>
          <Reveal delay={100} className="order-1 lg:order-2">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-lp-ink">
              See your cash flow at a glance.
            </h3>
          </Reveal>
          <Reveal delay={100} className="order-2 sm:hidden">
            <CashflowMobile />
          </Reveal>
        </div>

        {/* Change orders */}
        <div className="mt-[16vmin] grid items-center gap-8 sm:mt-[7vmin] lg:grid-cols-2 lg:gap-16">
          <Reveal className="lg:order-1">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-lp-ink">
              Change orders, in writing.
            </h3>
          </Reveal>
          <Reveal delay={100} className="sm:hidden">
            <ChangeOrderMobile />
          </Reveal>
          <Reveal delay={100} className="hidden sm:block lg:order-2">
            <ChangeOrderMock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
