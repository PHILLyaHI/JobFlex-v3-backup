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

function ProposalDoc() {
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-lp-mock">
      {/* Editor chrome */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 text-[13px] sm:px-6">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-lp-ink">‹ Proposals</span>
          <span className="hidden text-slate-400 sm:inline">Draft — saved</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="hidden font-medium text-slate-500 sm:inline">Preview</span>
          <span className="font-semibold text-lp-ink">Send for signature</span>
          <span className="grid h-5 w-5 grid-cols-2 gap-[2px]" aria-hidden>
            <span className="rounded-[2px] bg-slate-200" />
            <span className="rounded-[2px] bg-slate-300" />
            <span className="rounded-[2px] bg-slate-300" />
            <span className="rounded-[2px] bg-slate-200" />
          </span>
        </div>
      </div>

      {/* Document body */}
      <div className="mx-auto max-w-[46rem] px-5 pb-2 pt-9 sm:px-10 sm:pt-12">
        <div className="text-[12px] font-bold uppercase tracking-[1.5px] text-slate-400">
          Proposal · #P-1178
        </div>
        <h3 className="mt-3 text-[clamp(26px,3vw,40px)] font-bold leading-[1.1] tracking-[-0.02em] text-lp-ink">
          Nguyen kitchen remodel — 10×10, maple &amp; quartz
        </h3>
        <div className="mt-6 space-y-5 font-serif text-[17px] leading-[1.7] text-slate-700">
          <p>
            Thanks for walking us through the space on Tuesday. Below is the
            full scope for the kitchen: demo of the existing cabinets and
            soffit, rough-in for the relocated sink, semi-custom maple shaker
            cabinets, and quartz counters throughout.
          </p>
          <p>
            The price below is complete — materials at this week&rsquo;s
            retail pricing, labor, disposal, and permits. Anything outside
            this scope gets a written change order before we touch it.
          </p>
        </div>

        {/* Line items */}
        <div className="mt-8 overflow-hidden rounded-lg border border-slate-200">
          {[
            ["Cabinets — semi-custom maple shaker, 14 ln ft", "$8,400"],
            ["Countertop — quartz, 42 sf installed", "$2,436"],
            ["Sink relocation — plumbing rough-in", "$1,850"],
            ["Labor — demo, install, finish (112 hrs)", "$8,960"],
          ].map(([l, r], i) => (
            <div
              key={l}
              className={`flex items-center justify-between gap-4 px-4 py-3 text-[14px] ${
                i % 2 ? "bg-slate-50/60" : "bg-white"
              }`}
            >
              <span className="min-w-0 text-slate-600">{l}</span>
              <span className="shrink-0 font-semibold text-lp-ink">{r}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3.5">
            <span className="text-[14px] font-bold text-lp-ink">Project total</span>
            <span className="text-[18px] font-bold tracking-tight text-lp-ink">$27,860</span>
          </div>
        </div>

        {/* Option card */}
        <div className="mt-6 flex items-center justify-between rounded-lg border-2 border-dashed border-slate-200 px-4 py-3.5">
          <div>
            <div className="text-[13px] font-bold text-lp-ink">
              Option — soft-close hardware throughout
            </div>
            <div className="text-[12px] text-slate-400">
              Client can add this in the portal before signing
            </div>
          </div>
          <span className="text-[15px] font-bold text-lp-ink">+$640</span>
        </div>

        {/* Photo block */}
        <div className="mt-6 overflow-hidden rounded-lg">
          <Image
            src="/landing-d/service-remodel.jpg"
            alt="Reference photo included with the proposal"
            width={1104}
            height={520}
            className="block h-44 w-full object-cover"
          />
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
    <section className="relative overflow-hidden bg-lp-band px-5 py-[8vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-eyebrow text-slate-500">Proposals &amp; contracts</h2>
          <p className="mt-5 max-w-[56rem] text-[clamp(36px,4.4vw,64px)] font-bold leading-[1.02] tracking-[-0.02em] text-lp-ink">
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
        <div className="mt-[22vmin] grid items-center gap-10 sm:mt-[10vmin] lg:grid-cols-2 lg:gap-16">
          <Reveal className="order-2 lg:order-1">
            <ReceiptCluster />
          </Reveal>
          <Reveal delay={100} className="order-1 lg:order-2">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-lp-ink">
              Save every receipt.
            </h3>
            <p className="mt-4 max-w-[30rem] text-[17px] leading-[1.5] text-slate-600 sm:text-[19px]">
              Snap it — JobFlex reads the items and files the cost to the
              right job.
            </p>
          </Reveal>
        </div>

        {/* Sub-feature: invoicing */}
        <div className="mt-[16vmin] grid items-center gap-10 sm:mt-[9vmin] lg:grid-cols-2 lg:gap-16">
          <Reveal className="lg:order-1">
            <h3 className="text-[clamp(26px,2.6vw,36px)] font-bold tracking-[-0.015em] text-lp-ink">
              Send invoices to clients.
            </h3>
            <p className="mt-4 max-w-[30rem] text-[17px] leading-[1.5] text-slate-600 sm:text-[19px]">
              Invoice straight from finished work and get paid online.
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
