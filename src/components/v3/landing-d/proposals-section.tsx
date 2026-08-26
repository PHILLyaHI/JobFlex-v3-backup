"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AppWindow } from "./app-window";
import { InvoiceMobile } from "./invoice-mobile";
import { Reveal } from "./reveal";
import { useInView } from "./use-in-view";

/* Mobile proposal card — a real document with a visible send action */
function ProposalMobile() {
  return (
    <AppWindow title="app.jobflex.com/proposals/P-1178">
      <div className="px-4 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[1.4px] text-slate-400">
          Proposal · #P-1178
        </div>
        <div className="mt-1.5 text-[17px] font-bold leading-snug tracking-tight text-lp-ink">
          Nguyen kitchen remodel — 10×10, maple &amp; quartz
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          {[
            ["Cabinets — maple shaker, 14 ln ft", "$8,400"],
            ["Countertop — quartz, 42 sf", "$2,436"],
            ["Labor — demo, install, finish", "$8,960"],
          ].map(([l, r], i) => (
            <div
              key={l}
              className={`flex items-center justify-between px-3 py-2.5 text-[12px] ${i % 2 ? "bg-lp-paper" : "bg-white"}`}
            >
              <span className="text-slate-600">{l}</span>
              <span className="font-semibold text-lp-ink">{r}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-3">
            <span className="text-[12px] font-bold text-lp-ink">Project total</span>
            <span className="text-[16px] font-bold tracking-tight text-lp-ink">$27,860</span>
          </div>
        </div>

        <button
          type="button"
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-lp-ink text-[15px] font-semibold text-white"
        >
          Send to client
          <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
            <path d="M1.5 8L14.5 1.5 10 14.5l-2.6-4.4L1.5 8z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </AppWindow>
  );
}

type SendStage = "draft" | "pressing" | "delivered" | "signed";

/* The desktop proposal. Deliberately compact — the whole document has to be
   readable inside one screen, so this is a trimmed plate rather than a
   full-bleed page.

   It also plays the thing the section claims. The one action button carries the
   whole story rather than a toast appearing beside it: it is pressed, the
   button itself becomes "Delivered to M. Nguyen", and when the client signs
   the same button becomes the
   signed confirmation. One stage value drives the button, the total, the
   scrawl and the stamp, so they can never disagree. */
function ProposalDoc() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const [stage, setStage] = useState<SendStage>("draft");

  useEffect(() => {
    if (!inView) return;
    // Reduced motion gets the outcome, with no press or loop.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setStage("signed"));
      return () => cancelAnimationFrame(id);
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const run = () => {
      setStage("draft");
      at(1500, () => {
        setStage("pressing");
      });
      at(1980, () => setStage("delivered"));
      at(4400, () => setStage("signed"));
      at(9200, run);
    };
    run();
    return () => timers.forEach(clearTimeout);
  }, [inView]);

  const sent = stage === "delivered" || stage === "signed";
  const signed = stage === "signed";
  const pressing = stage === "pressing";

  return (
    <div ref={ref} className="relative mx-auto max-w-[42rem]">
      <div
        className="overflow-hidden rounded-xl bg-white shadow-lp-mock"
      >
        {/* Editor chrome — one button, and it reports the whole flow */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-[12px] sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-lp-ink">&lsaquo; Proposals</span>
            <span className="hidden text-slate-400 sm:inline">
              {signed ? "Signed" : sent ? "Sent" : "Draft — saved"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden font-medium text-slate-500 sm:inline">Preview</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11.5px] font-semibold ${
                signed
                  ? "bg-emerald-600 text-white"
                  : sent
                    ? "bg-lp-blue text-white"
                    : "bg-lp-ink text-white"
              }`}
              style={{
                transform: pressing ? "scale(.94)" : "scale(1)",
                transition:
                  "transform .28s cubic-bezier(.22,.61,.36,1), background-color .35s ease",
              }}
            >
              {signed ? (
                <>
                  <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                    <path
                      d="M3 8.5l3.2 3L13 5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  M. Nguyen signed the proposal
                </>
              ) : sent ? (
                /* No blinking dot (owner, 2026-08-25): a pulsing indicator on a
                   finished action reads as a bot thinking, not as a delivery. */
                <>
                  <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                    <path d="M1.5 8L14.5 1.5 10 14.5l-2.6-4.4L1.5 8z" fill="currentColor" />
                  </svg>
                  Delivered to M. Nguyen
                </>
              ) : (
                <>
                  Send for signature
                  <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                    <path d="M1.5 8L14.5 1.5 10 14.5l-2.6-4.4L1.5 8z" fill="currentColor" />
                  </svg>
                </>
              )}
            </span>
          </div>
        </div>

      {/* Document body */}
      <div className="mx-auto max-w-[38rem] px-5 pb-6 pt-6 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-bold uppercase tracking-[1.4px] text-slate-400">
            Proposal · #P-1178
          </div>
          <div className="text-[10px] font-medium text-slate-400">Valid 30 days</div>
        </div>
        <h3 className="mt-1.5 text-[clamp(18px,2vw,26px)] font-bold leading-[1.15] tracking-[-0.02em] text-lp-ink">
          Nguyen kitchen remodel — 10×10, maple &amp; quartz
        </h3>
        <p className="mt-2.5 font-serif text-[12.5px] leading-[1.55] text-slate-600">
          Full scope for the kitchen: demo, rough-in for the relocated sink,
          semi-custom maple shaker cabinets and quartz counters. The price is
          complete — anything outside it gets a written change order first.
        </p>

        {/* Line items */}
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          {[
            ["Cabinets — semi-custom maple shaker, 14 ln ft", "$8,400"],
            ["Countertop — quartz, 42 sf installed", "$2,436"],
            ["Sink relocation — plumbing rough-in", "$1,850"],
            ["Labor — demo, install, finish (112 hrs)", "$8,960"],
          ].map(([l, r], i) => (
            <div
              key={l}
              className={`flex items-center justify-between gap-4 px-3 py-1.5 text-[11.5px] ${
                i % 2 ? "bg-slate-50/60" : "bg-white"
              }`}
            >
              <span className="min-w-0 truncate text-slate-600">{l}</span>
              <span className="shrink-0 font-semibold text-lp-ink">{r}</span>
            </div>
          ))}
          <div
            className={`flex items-center justify-between border-t px-3 py-2 transition-colors duration-500 ${
              signed ? "border-emerald-200 bg-emerald-50/70" : "border-slate-200 bg-white"
            }`}
          >
            <span className="text-[12px] font-bold text-lp-ink">Project total</span>
            <span className="text-[15px] font-bold tracking-tight text-lp-ink">$27,860</span>
          </div>
        </div>

        {/* Option and signature share a row so the plate stays short */}
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-[11.5px] font-bold text-lp-ink">
                Option — soft-close hardware
              </div>
              <div className="truncate text-[10px] text-slate-400">
                Client adds this in the portal
              </div>
            </div>
            <span className="shrink-0 text-[12.5px] font-bold text-lp-ink">+$640</span>
          </div>

          {/* Signature block — the scrawl draws itself once the client signs,
              and the stamp lands on the corner of the block it belongs to
              rather than floating over the photo strip. */}
          <div className="relative rounded-lg border border-slate-200 px-3 py-2">
            {signed && (
              <div
                className="pointer-events-none absolute -top-3.5 right-1 z-10 -rotate-[9deg] rounded-md border-2 border-emerald-600/70 bg-white/85 px-2.5 py-0.5 text-[11.5px] font-black uppercase tracking-[0.2em] text-emerald-700/90"
                style={{ animation: "lpStamp .45s cubic-bezier(.2,.8,.3,1.2) backwards" }}
              >
                Accepted
              </div>
            )}
            <div className="text-[9.5px] font-bold uppercase tracking-[1.2px] text-slate-400">
              Client signature
            </div>
            <div className="relative h-7">
              <svg viewBox="0 0 150 34" className="absolute inset-0 h-full w-[120px]" aria-hidden>
                <path
                  d="M6 25 C20 6 30 30 44 16 C56 6 62 26 78 18 C94 10 102 26 120 14 141 2 136 22 144 18"
                  fill="none"
                  stroke="#1854A0"
                  strokeWidth="2"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: signed ? 0 : 1,
                    transition: "stroke-dashoffset 1.1s cubic-bezier(.4,0,.2,1)",
                  }}
                />
              </svg>
            </div>
            <div className="border-t border-slate-200 pt-1 text-[9.5px] text-slate-400">
              {signed ? "M. Nguyen · signed today" : "Awaiting the client"}
            </div>
          </div>
        </div>

        {/* Reference photo — kept, but reduced to a strip so the plate fits */}
        <div className="mt-3 overflow-hidden rounded-lg">
          <Image
            src="/landing-d/service-remodel.jpg"
            alt="Reference photo included with the proposal"
            width={1104}
            height={520}
            className="block h-20 w-full object-cover"
          />
        </div>
        </div>
      </div>
    </div>
  );
}

const EXTRACTED: [string, string][] = [
  ["Framing lumber", "$102.72"],
  ["Drywall finishing", "$51.84"],
  ["Fasteners", "$28.90"],
];

function ReceiptCluster() {
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  // After each scan pass, line descriptions resolve into dollar amounts
  const [priced, setPriced] = useState(false);

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setPriced(true));
      return () => cancelAnimationFrame(id);
    }
    const t = setInterval(() => setPriced((p) => !p), 2600);
    return () => clearInterval(t);
  }, [inView]);

  return (
    <div ref={ref} className="relative mx-auto max-w-[34rem] py-6">
      {/* receipt */}
      <div className="relative w-[58%] -rotate-3 rounded-lg bg-white p-4 shadow-lp-card">
        <div className="text-center text-[10px] font-bold tracking-widest text-slate-500">
          BIG BOX SUPPLY #214
        </div>
        <div className="mt-2 border-t border-dashed border-slate-200 pt-2 font-mono text-[10px] leading-[1.9] text-slate-500">
          <div className="flex justify-between"><span>2X4X8 KD STUD ×24</span><span>102.72</span></div>
          <div className="flex justify-between"><span>JNT COMPOUND 4.5G ×3</span><span>51.84</span></div>
          <div className="flex justify-between"><span>DW SCREW 1-5/8 5LB</span><span>28.90</span></div>
          <div className="flex justify-between font-bold text-lp-ink"><span>TOTAL</span><span>183.46</span></div>
        </div>
        {inView && (
          <span
            className="pointer-events-none absolute inset-x-2 h-[3px] rounded-full bg-lp-lime shadow-[0_0_14px_2px_rgb(209_255_25/0.9)]"
            style={{ animation: "scanline 2.6s cubic-bezier(.4,0,.4,1) .3s infinite" }}
          />
        )}
      </div>
      {/* extracted card */}
      <div className="absolute right-0 top-10 w-[54%] rotate-2 rounded-lg bg-white p-4 shadow-lp-card">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
          <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-100 text-[8px]">✓</span>
          3 ITEMS EXTRACTED
        </div>
        <div className="mt-2.5 space-y-1.5">
          {EXTRACTED.map(([label, price], i) => (
            <div key={label} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-500">{label}</span>
              {priced ? (
                <span
                  key="price"
                  className="font-bold text-lp-ink"
                  style={{ animation: `toast-in .35s cubic-bezier(.2,.6,.2,1) ${i * 0.12}s backwards` }}
                >
                  {price}
                </span>
              ) : (
                <span key="bar" className="h-1 w-10 rounded-full bg-slate-100" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ProposalsSection() {
  return (
    <section className="relative overflow-hidden bg-lp-band px-5 py-[8vmin] max-sm:pb-[16vmin] max-sm:pt-[16vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          {/* The eyebrow is desktop-only: on a phone it just crowded the
              headline it was labelling (owner, 2026-08-25). */}
          <h2 className="lp-eyebrow hidden text-slate-500 sm:block">Proposals &amp; contracts</h2>
          <p className="max-w-[56rem] sm:mt-5 text-[clamp(36px,4.4vw,64px)] font-bold leading-[1.02] tracking-[-0.02em] text-lp-ink">
            Send proposals clients can sign.
          </p>
          <p className="mt-5 text-[17px] font-medium leading-[1.5] text-slate-600 sm:mt-7 sm:text-[clamp(19px,1.7vw,24px)]">
            A finished estimate becomes a signed contract in one click.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10 sm:hidden">
          <ProposalMobile />
        </Reveal>
        <Reveal delay={120} className="mt-14 hidden sm:block">
          <div data-parallax="22">
            <ProposalDoc />
          </div>
        </Reveal>

        {/* Sub-feature: receipts — text leads on mobile, cluster leads on desktop */}
        <div className="mt-[26vmin] grid items-center gap-10 sm:mt-[10vmin] lg:grid-cols-2 lg:gap-16">
          <Reveal className="order-2 lg:order-1">
            <ReceiptCluster />
          </Reveal>
          <Reveal delay={100} className="order-1 lg:order-2">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-lp-ink">
              Save every receipt.
            </h3>
            <p className="mt-4 max-w-[30rem] text-[17px] leading-[1.5] text-slate-600 sm:text-[19px]">
              Photograph it at the counter. The scanner reads every line and
              files the cost to the right job.
            </p>
          </Reveal>
        </div>

        {/* Sub-feature: invoicing */}
        <div className="mt-[26vmin] grid items-center gap-10 sm:mt-[9vmin] lg:grid-cols-2 lg:gap-16">
          <Reveal className="lg:order-1">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-lp-ink">
              Send invoices to clients.
            </h3>
            <p className="mt-4 max-w-[30rem] text-[17px] leading-[1.5] text-slate-600 sm:text-[19px]">
              Send the invoice when the work is done. Your client pays by
              card through Stripe or Square.
            </p>
          </Reveal>
          <Reveal delay={100} className="lg:order-2">
            <div className="w-full lg:mx-auto lg:max-w-[26rem]">
              <InvoiceMobile />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
