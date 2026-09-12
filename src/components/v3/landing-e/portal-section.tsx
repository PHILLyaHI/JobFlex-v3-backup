"use client";

import { useEffect, useState } from "react";
import type { PortalContent } from "./landing-groups";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

/* The default page's and the interior trades' job; other groups hand in theirs. */
const KITCHEN: PortalContent = {
  title: "Nguyen kitchen remodel · Proposal #P-1178",
  baseOption: "Standard hardware",
  upgradeOption: "Soft-close upgrade",
  upgradePrice: "+$640",
  total: "$27,860",
  totalUpgraded: "$28,500",
};

export function PortalSection({ portal = KITCHEN }: { portal?: PortalContent }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  // 0 idle · 1 upgrade picked · 2 signing · 3 signed
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let alive = true;
    const run = () => {
      if (!alive) return;
      setStep(1);
      setTimeout(() => alive && setStep(2), 1300);
      setTimeout(() => alive && setStep(3), 3100);
      setTimeout(() => alive && setStep(0), 5600);
    };
    const t0 = setTimeout(run, 900);
    const t = setInterval(run, 6800);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(t);
    };
  }, [inView]);

  const upgraded = step >= 1;

  return (
    // THE BLUEPRINT SHEET (owner, 2026-09-10): flat blueprint blue under the
    // white drafting grid (landing-d.css, .lp-portal); the card inside carries
    // a 1 px white line and a hard offset shadow of solid ink. No gradient
    // anywhere — the band that used to run one is now the sheet itself.
    <section id="portal" className="lp-portal relative overflow-hidden px-5 py-[8vmin] max-sm:pb-[12vmin] max-sm:pt-[11vmin] sm:px-6">
      <div className="relative z-[1] mx-auto lp-wrap">
        <div className="grid items-center gap-8 sm:gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-20">
          {/* Pink portal surface — full-bleed band on mobile, rounded card on sm+ */}
          <Reveal className="order-2 lg:order-1">
            <div
              ref={ref}
              /* The band hugs the card rather than framing it in a slab of
                 sky (owner, 2026-08-25). Since the sheet is the blue, the
                 band has no fill of its own: the card sits on the grid. */
              className="relative flex items-center justify-center rounded-[12px] px-3 py-6 sm:min-h-[560px] sm:rounded-[10px] sm:px-6 sm:py-16"
            >
              {/* The inner plate takes the band's corner, not a softer one —
                  two different radii nested read as a mistake (owner,
                  2026-08-25). */}
              <div className="lp-portal-mock w-full max-w-[360px] rounded-[12px] bg-white p-5 sm:max-w-[330px] sm:rounded-[10px] sm:p-6">
                <div className="text-center">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-lp-blue/10">
                    <svg viewBox="0 0 20 20" className="h-5 w-5 text-lp-blue" aria-hidden>
                      <path d="M4 14.5l8.5-8.5 1.5 1.5L5.5 16H4v-1.5z" fill="currentColor" />
                      <path d="M12 4l4 4" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </div>
                  <div className="mt-3 text-[19px] font-bold text-ink">Review &amp; approve</div>
                  <div className="mt-1 text-[14px] text-[#666666]">
                    {portal.title}
                  </div>
                </div>

                {/* Options */}
                <div className="mt-5 space-y-2">
                  <div
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors duration-300 ${
                      !upgraded ? "border-lp-blue bg-lp-blue/[0.04]" : "border-slate-200"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-[14px] font-medium text-ink">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                          !upgraded ? "border-lp-blue" : "border-slate-300"
                        }`}
                      >
                        {!upgraded && <span className="h-2 w-2 rounded-full bg-lp-blue" />}
                      </span>
                      {portal.baseOption}
                    </span>
                    <span className="text-[14px] font-semibold text-[#666666]">$0</span>
                  </div>
                  <div
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors duration-300 ${
                      upgraded ? "border-lp-blue bg-lp-blue/[0.04]" : "border-slate-200"
                    }`}
                  >
                    <span className="flex items-center gap-2.5 text-[14px] font-medium text-ink">
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors duration-300 ${
                          upgraded ? "border-lp-blue" : "border-slate-300"
                        }`}
                      >
                        {upgraded && <span className="h-2 w-2 rounded-full bg-lp-blue" />}
                      </span>
                      {portal.upgradeOption}
                    </span>
                    <span className="text-[14px] font-semibold text-ink">{portal.upgradePrice}</span>
                  </div>
                </div>

                {/* Total */}
                <div className="mt-4 flex items-baseline justify-between border-t border-slate-100 pt-3.5">
                  <span className="text-[14px] text-[#666666]">Total</span>
                  <span
                    key={String(upgraded)}
                    className="text-[20px] font-bold tracking-tight text-ink"
                    style={{ animation: "toast-in .4s cubic-bezier(.2,.6,.2,1)" }}
                  >
                    {upgraded ? portal.totalUpgraded : portal.total}
                  </span>
                </div>

                {/* Signature */}
                <div className="relative mt-4 h-[74px] rounded-lg border border-dashed border-slate-300 bg-slate-50">
                  <span className="absolute left-3 top-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#666666]">
                    Sign here
                  </span>
                  <svg viewBox="0 0 260 60" className="absolute inset-0 h-full w-full" aria-hidden>
                    <path
                      d="M24 42c10-18 16-24 18-16 2 7-6 20 2 18 9-2 13-24 22-24s2 26 12 24 14-22 22-22 4 22 14 20c8-1.5 16-14 30-14 10 0 16 6 34 4 12-1.4 22-6 38-4"
                      fill="none"
                      stroke="#0a0a0a"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={step >= 2 ? 0 : 1}
                      style={{
                        transition: step >= 2 ? "stroke-dashoffset 1.5s ease-in-out" : "none",
                        opacity: step >= 2 ? 1 : 0,
                      }}
                    />
                  </svg>
                </div>

                {/* CTA */}
                <div
                  className={`mt-4 flex h-11 items-center justify-center gap-2 rounded-lg text-[14px] font-bold text-white transition-colors duration-400 ${
                    step === 3 ? "bg-lp-toggle" : "bg-lp-base"
                  }`}
                >
                  {step === 3 ? (
                    <>
                      <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                        <path d="M3 8.5l3.2 3L13 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Signed — deposit paid
                    </>
                  ) : (
                    "Approve & sign"
                  )}
                </div>
              </div>

              {/* signed-doc badge */}
              {step === 3 && (
                <span
                  className="lp-portal-mock absolute right-[14%] top-[12%] flex h-12 w-12 items-center justify-center rounded-2xl bg-white"
                  style={{ animation: "envelope-pop .5s cubic-bezier(.2,.6,.2,1)" }}
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink" aria-hidden>
                    <rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M8 8h8M8 12h8M8 16h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-lp-blue text-[10px] font-bold text-white">
                    1
                  </span>
                </span>
              )}
            </div>
          </Reveal>

          {/* Text column */}
          {/* No extra px-5: the section already pads, and the doubled gutter
              made the heading narrower than the card under it (owner,
              2026-08-25). */}
          <Reveal delay={120} className="order-1 lg:order-2">
            <p className="text-[30px] font-bold leading-[1.08] tracking-[-0.02em] text-white sm:text-[clamp(34px,4vw,58px)] sm:leading-[1.05] sm:tracking-[-0.015em]">
              Get jobs signed.
            </p>
            <p className="mt-4 max-w-[26rem] text-[17px] leading-[1.5] text-white/80 sm:text-[20px] sm:leading-[1.55]">
              Homeowners pick options, sign, and pay the deposit — right from
              their phone.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
