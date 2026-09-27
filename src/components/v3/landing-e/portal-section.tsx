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

/* Who signs the tap-to-approve box. The built-in kitchen is M. Nguyen; a
   trade group's portal carries no client field (landing-groups.ts), so the
   page may hand one in (`client`) and otherwise the surname that opens the
   job title is written — never an invented initial. */
const KITCHEN_CLIENT = "M. Nguyen";
function signerFor(portal: PortalContent, client?: string) {
  if (client) return client;
  if (portal.title === KITCHEN.title) return KITCHEN_CLIENT;
  return portal.title.split(/\s+/)[0] ?? "";
}

export function PortalSection({ portal = KITCHEN, client }: { portal?: PortalContent; client?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  // 0 idle · 1 upgrade picked · 2 tapped — the name writes in · 3 accepted
  const [step, setStep] = useState(0);
  const signer = signerFor(portal, client);

  useEffect(() => {
    if (!inView) return;
    // Reduced motion gets the outcome: picked, signed, accepted — no loop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setStep(3));
      return () => cancelAnimationFrame(id);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const run = () => {
      setStep(1);
      at(1400, () => setStep(2));
      at(3300, () => setStep(3));
      at(6200, () => setStep(0));
      at(7400, run);
    };
    at(900, run);
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  const upgraded = step >= 1;
  const signed = step >= 2;

  return (
    // THE BLUEPRINT SHEET (owner, 2026-09-10): flat blueprint blue under the
    // white drafting grid (landing-e.css, .lp-portal); the card inside carries
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
                  {/* A 2 px blueprint ring (owner, 2026-09-26): without it the
                      pale disc melted into the white card. */}
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border-2 border-lp-blue bg-lp-blue/10">
                    {/* A tick, not a pen. The pen said "sign this" over a flow
                        that records an online approval and no signature. */}
                    <svg viewBox="0 0 20 20" className="h-5 w-5 text-lp-blue" aria-hidden>
                      <path d="M4.5 10.5l4 4 7-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

                {/* Tap to approve (owner, 2026-09-26). The dashed box is the
                    signature: the client taps it and their name is written in
                    — a tick, then the name in a hand-set serif italic, as the
                    change order signs. There is no separate name field. */}
                <div
                  className={`relative mt-4 h-[74px] overflow-hidden rounded-lg border border-dashed transition-colors duration-300 ${
                    signed ? "border-lp-blue bg-lp-blue/[0.04]" : "border-slate-400 bg-slate-50"
                  }`}
                >
                  <span className="absolute left-3 top-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#555555]">
                    {signed ? "Approved by" : "Tap to approve"}
                  </span>
                  {step === 2 && <span className="lp-tap-ring" aria-hidden />}
                  <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-center gap-2.5">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden>
                      <path
                        d="M4 12.5l5 5L20 6"
                        fill="none"
                        stroke="#1854A0"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        strokeDasharray={1}
                        strokeDashoffset={signed ? 0 : 1}
                        style={{ transition: signed ? "stroke-dashoffset .45s cubic-bezier(.4,0,.2,1) .15s" : "none" }}
                      />
                    </svg>
                    <span
                      className="whitespace-nowrap font-serif text-[27px] italic leading-none text-ink"
                      style={{
                        clipPath: signed ? "inset(-10% -4% -30% 0)" : "inset(-10% 100% -30% 0)",
                        transition: signed ? "clip-path 1s cubic-bezier(.45,.05,.55,.95) .55s" : "none",
                      }}
                    >
                      {signer}
                    </span>
                  </div>
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
                      Accepted — deposit paid
                    </>
                  ) : (
                    "Accept proposal"
                  )}
                </div>
              </div>

              {/* approved-doc badge */}
              {step === 3 && (
                <span
                  className="lp-portal-mock absolute right-[14%] top-[12%] max-sm:right-0 max-sm:top-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-white"
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
              Get jobs approved.
            </p>
            <p className="mt-4 max-w-[26rem] text-[17px] leading-[1.5] text-white/80 sm:text-[20px] sm:leading-[1.55]">
              Homeowners pick options, approve, and pay the deposit — right from
              their phone.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
