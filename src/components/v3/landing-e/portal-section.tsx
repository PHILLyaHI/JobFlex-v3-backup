"use client";

import { useEffect, useState } from "react";
import type { PortalContent } from "./landing-groups";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";
import "./portal-pass.css";

/* The default page's and the interior trades' job; other groups hand in theirs. */
const KITCHEN: PortalContent = {
  title: "Nguyen kitchen remodel · Proposal #P-1178",
  baseOption: "Standard hardware",
  upgradeOption: "Soft-close upgrade",
  upgradePrice: "+$640",
  total: "$27,860",
  totalUpgraded: "$28,500",
};

/* Who signs the sign box. The built-in kitchen is M. Nguyen; a
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
  // 0 idle · 1 upgrade picked · 2 tapped: the box reads "Approved by" ·
  // 3 the name writes in under it · 4 accepted. The label and the name are
  // separate steps (owner, 2026-09-26): the label changes first, then the
  // signature is written — never the name before the words that introduce it.
  const [step, setStep] = useState(0);
  const signer = signerFor(portal, client);

  useEffect(() => {
    if (!inView) return;
    // Reduced motion gets the outcome: picked, signed, accepted — no loop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setStep(4));
      return () => cancelAnimationFrame(id);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const run = () => {
      setStep(1);
      at(1400, () => setStep(2));
      at(2100, () => setStep(3)); // the label has landed; the 1.05 s write starts
      at(3700, () => setStep(4));
      at(6600, () => setStep(0));
      at(7800, run);
    };
    at(900, run);
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  const upgraded = step >= 1;
  const signed = step >= 2;
  const written = step >= 3;
  const accepted = step >= 4;

  return (
    // THE BLUEPRINT SHEET (owner, 2026-09-10): flat blueprint blue under the
    // white drafting grid (landing-e.css, .lp-portal); the card inside carries
    // a 2 px ink frame (2026-09-26, portal-pass.css) and a hard offset shadow
    // of solid ink. No gradient anywhere — the band that used to run one is
    // now the sheet itself.
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
              {/* The document that pops when the proposal is accepted sits on
                  the card's own corner, so the card is its anchor at every
                  width (it was placed by percentages of the band). */}
              <div className="relative w-full max-w-[360px] sm:max-w-[330px]">
                {/* The inner plate takes the band's corner, not a softer one —
                    two different radii nested read as a mistake (owner,
                    2026-08-25). A 2px ink frame and the hard ink offset (owner,
                    2026-09-26; portal-pass.css). */}
                <div className="lp-portal-mock lp-pt-card rounded-[12px] bg-white p-5 sm:rounded-[10px] sm:p-6">
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

                  {/* Sign (owner, 2026-09-26). The dashed box is the signature:
                      the client taps it, the prompt turns to "Approved by", and
                      then their name is written in under it, from the box's left
                      edge — in a hand-set serif italic, as the change order
                      signs, the one face on this card that is not Inter or
                      JetBrains Mono. No tick, no separate name field. */}
                  <div
                    className={`relative mt-4 h-[74px] overflow-hidden rounded-lg border border-dashed transition-colors duration-300 ${
                      signed ? "border-lp-blue bg-lp-blue/[0.04]" : "border-slate-400 bg-slate-50"
                    }`}
                  >
                    <span
                      key={signed ? "approved" : "sign"}
                      className="lp-pt-label absolute left-3 top-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#555555]"
                    >
                      {signed ? "Approved by" : "Sign"}
                    </span>
                    {step === 2 && <span className="lp-pt-tap" aria-hidden />}
                    <span
                      className={`lp-pt-name absolute bottom-2.5 left-3 whitespace-nowrap pr-[0.15em] font-serif text-[27px] italic leading-none text-ink${
                        written ? " is-written" : ""
                      }`}
                    >
                      {signer}
                    </span>
                  </div>

                  {/* CTA */}
                  <div
                    className={`mt-4 flex h-11 items-center justify-center gap-2 rounded-lg text-[14px] font-bold text-white transition-colors duration-300 ${
                      accepted ? "bg-lp-toggle" : "bg-lp-base"
                    }`}
                  >
                    {accepted ? (
                      <>
                        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                          <path d="M3 8.5l3.2 3L13 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Accepted
                      </>
                    ) : (
                      "Accept proposal"
                    )}
                  </div>
                </div>

                {/* approved-doc badge, framed in ink like the card */}
                {accepted && (
                  <span
                    className="lp-portal-mock lp-pt-doc absolute -right-4 -top-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white sm:-right-5 sm:-top-5"
                    style={{ animation: "envelope-pop .5s cubic-bezier(.2,.6,.2,1)" }}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink" aria-hidden>
                      <rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
                      <path d="M8 8h8M8 12h8M8 16h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                    </svg>
                    <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-lp-blue text-[10px] font-bold text-white">
                      1
                    </span>
                  </span>
                )}
              </div>
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
