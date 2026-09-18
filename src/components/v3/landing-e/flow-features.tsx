"use client";

import { useEffect, useState } from "react";
import { StampIn } from "./stamp-in";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

function CashflowCards() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  return (
    /* The same cluster on a phone, only tighter: the pill drops its tail so it
       clears the donut at 350px, and the donut takes a little more width back
       from the overlap (owner, 2026-08-25). */
    <div ref={ref} className="relative mx-auto max-w-[32rem] py-7 sm:py-8">
      {/* line chart card — white, only the line and its grid (owner, 2026-09-10) */}
      <div className="lp-mock-hard w-[80%] rounded-xl bg-white p-4 sm:w-[78%] sm:p-5" data-guide="revenue-in">
        <div className="text-[13px] font-bold text-lp-blue">Revenue</div>
        <div className="text-[26px] font-bold tracking-tight text-ink">
          +24%{" "}
          <span className="text-[13px] font-semibold text-[#6a6a6a]">vs last quarter</span>
        </div>
        <svg viewBox="0 0 300 90" className="mt-3 w-full" aria-hidden>
          {[0, 60, 120, 180, 240, 300].map((x) => (
            <line key={x} x1={x} y1="0" x2={x} y2="84" stroke="#1854A0" strokeOpacity="0.08" />
          ))}
          <path
            d="M0 74 C40 66 54 48 84 52 C118 56 130 30 162 34 C196 38 210 16 244 22 C266 26 284 12 300 8"
            fill="none"
            stroke="#1854A0"
            strokeWidth="2.5"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={inView ? 0 : 1}
            style={{ transition: "stroke-dashoffset 1.5s cubic-bezier(.2,.6,.2,1) .2s" }}
          />
        </svg>
      </div>

      {/* donut card — collected reads green, outstanding stays amber */}
      <div className="lp-mock-hard absolute -bottom-2 left-0 w-[52%] rounded-xl bg-white p-3.5 sm:w-[46%] sm:p-4" data-guide="revenue-out">
        <div className="flex items-center gap-3 sm:gap-3.5">
          <svg viewBox="0 0 64 64" className="h-14 w-14 -rotate-90 sm:h-16 sm:w-16" aria-hidden>
            <circle cx="32" cy="32" r="24" fill="none" stroke="#f1f5f9" strokeWidth="12" />
            <circle
              cx="32" cy="32" r="24" fill="none" stroke="#f59e0b" strokeWidth="12"
              strokeDasharray="150.8"
              strokeDashoffset={inView ? 150.8 * (1 - 0.18) : 150.8}
              style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.6,.2,1) .7s" }}
            />
            <circle
              cx="32" cy="32" r="24" fill="none" stroke="#3A7D44" strokeWidth="12"
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
            <div className="text-[15px] font-bold text-ink sm:text-[17px]">Paid</div>
            <div className="text-[10px] leading-tight text-[#6a6a6a] sm:text-[11px]">
              82% collected
              <br />
              18% outstanding
            </div>
          </div>
        </div>
      </div>

      {/* KPI pill */}
      <div className="lp-mock-hard absolute right-0 bottom-9 flex items-center gap-1.5 rounded-full bg-white px-3 py-2 sm:-right-1 sm:bottom-8 sm:gap-2 sm:px-4 sm:py-2.5">
        <span className="cursor-default text-[12px] text-emerald-600 sm:text-[14px]" aria-hidden>
          ▲
        </span>
        <span className="text-[12px] font-bold text-ink sm:text-[14px]">
          +18% collected<span className="hidden sm:inline"> this week</span>
        </span>
      </div>
    </div>
  );
}

const CO_SCOPE = "Add recessed lighting — 6 cans, dimmer";
const CO_AMOUNT = "1,240";
type CoStage = "form" | "priced" | "statement";

/* The change order writes itself: the scope is typed into the field, the price
   lands, then the form resolves into the approved statement that goes to the
   client. Three stages so the caret, the fields and the approval can never
   contradict each other; the loop only runs while the card is on screen. */
function ChangeOrderMock() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const [stage, setStage] = useState<CoStage>("form");
  const [typed, setTyped] = useState(0);

  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Stage clock.
  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      const id = requestAnimationFrame(() => {
        setTyped(CO_SCOPE.length);
        setStage("statement");
      });
      return () => cancelAnimationFrame(id);
    }
    let a: ReturnType<typeof setTimeout>;
    let b: ReturnType<typeof setTimeout>;
    let c: ReturnType<typeof setTimeout>;
    const run = () => {
      setTyped(0);
      setStage("form");
      a = setTimeout(() => setStage("priced"), 2900);
      b = setTimeout(() => setStage("statement"), 4100);
      c = setTimeout(run, 9000);
    };
    run();
    return () => {
      clearTimeout(a);
      clearTimeout(b);
      clearTimeout(c);
    };
  }, [inView, reduced]);

  // The scope types itself, one character at a time, only while filling in.
  useEffect(() => {
    if (!inView || reduced || stage !== "form") return;
    if (typed >= CO_SCOPE.length) return;
    const t = setTimeout(() => setTyped((n) => n + 1), 38);
    return () => clearTimeout(t);
  }, [inView, reduced, stage, typed]);

  const priced = stage !== "form";
  const done = stage === "statement";

  return (
    <div ref={ref} className="relative mx-auto max-w-[28rem] py-6 sm:py-8">
      <div className="lp-mock-hard rounded-xl bg-white p-5 sm:p-6" data-guide="co">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-bold text-ink">
            Change order #3
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors duration-300 ${
              done ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-[#666666]"
            }`}
          >
            {done ? <StampIn active>APPROVED</StampIn> : "DRAFT"}
          </span>
        </div>

        {/* Scope — a field while it fills, a heading once it is written */}
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#6a6a6a]">
            Scope
          </div>
          {/* Padding is constant (pass C): only the dashed frame fades,
              so the scope text never moves. */}
          <div
            className={`relative mt-1 rounded-md border border-dashed px-2.5 py-1.5 text-[15px] font-semibold leading-snug text-ink transition-colors duration-300 ${
              done ? "border-transparent" : "border-slate-300"
            }`}
          >
            {/* The full scope sizes the box from the first frame (pass C):
                the typed text sits on top of it, so a line that wraps as it
                is typed never grows the card. */}
            <span className="invisible" aria-hidden>{CO_SCOPE}</span>
            <span className="absolute inset-x-2.5 top-1.5">
              {CO_SCOPE.slice(0, typed)}
              {!done && typed < CO_SCOPE.length && (
                <span
                  className="ml-0.5 inline-block h-[15px] w-[2px] translate-y-[2px] bg-lp-blue"
                  style={{ animation: "caret 1s steps(1,end) infinite" }}
                />
              )}
            </span>
          </div>
        </div>

        {/* The note's room is reserved from the start (pass C): it fades and
            settles in with opacity and a transform, so the card below never
            shifts — the layout-shift this section used to cost the page. */}
        <p
          aria-hidden={!done}
          className={`mt-2 text-[13px] leading-relaxed text-[#666666] transition-[opacity,transform] duration-500 ${
            done ? "translate-y-0 opacity-100" : "-translate-y-1 opacity-0"
          }`}
        >
          Requested during Tuesday walkthrough. Includes fixtures, wiring,
          patch &amp; paint. Two added days on the schedule.
        </p>

        {/* Price + approval */}
        <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#6a6a6a]">
              Amount
            </div>
            {/* One 33 px row either way (pass C): the placeholder and the
                price are the same height, so the row never moves. */}
            <div className="flex h-[33px] items-end">
              {priced ? (
                <div
                  className="text-[22px] font-bold leading-none tracking-tight text-ink"
                  style={{ animation: "toast-in .35s cubic-bezier(.2,.6,.2,1) backwards" }}
                >
                  +${CO_AMOUNT}
                </div>
              ) : (
                <div className="h-[26px] w-24 rounded-md border border-dashed border-slate-300" />
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-[1.2px] text-[#6a6a6a]">
              Client
            </div>
            <div className="flex h-[33px] items-end justify-end">
              {done ? (
                <div
                  className="font-serif text-[19px] italic leading-none text-[#555555]"
                  style={{ animation: "toast-in .4s cubic-bezier(.2,.6,.2,1) backwards" }}
                >
                  M. Nguyen
                </div>
              ) : (
                <div className="h-[26px] w-28 border-b border-dashed border-slate-300" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FlowFeatures() {
  return (
    <section className="relative overflow-hidden bg-white px-5 pb-[8vmin] pt-[6vmin] max-sm:pb-[10vmin] max-sm:pt-[16vmin] sm:px-6 lg:pt-[10vmin]">
      <div className="mx-auto lp-wrap">
        {/* Cash flow — text leads on mobile */}
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
          {/* One card, both viewports (owner, 2026-08-25) — the desktop
              cluster is the picture of this feature, so the phone gets the
              same one rather than a second design of it. */}
          <Reveal delay={100} className="order-1 lg:order-2">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-ink" data-guide-avoid>
              See your cash flow at a glance.
            </h3>
          </Reveal>
          <Reveal className="order-2 lg:order-1">
            <CashflowCards />
          </Reveal>
        </div>

        {/* Change orders */}
        <div className="mt-[16vmin] grid items-center gap-8 sm:mt-[7vmin] lg:grid-cols-2 lg:gap-16">
          <Reveal className="lg:order-1">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-ink" data-guide-avoid>
              Change orders, in writing.
            </h3>
          </Reveal>
          <Reveal delay={100} className="lg:order-2">
            <ChangeOrderMock />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
