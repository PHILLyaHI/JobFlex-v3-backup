import { Check, Database, Download, FileJson, Globe } from "lucide-react";
import { ownership } from "@/lib/v3/landing-copy";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";
import { SectionLabel } from "./_primitives/SectionLabel";
import { PlusCorner } from "./_primitives/PlusCorner";

export function ContractorOwnedOps03() {
  return (
    <section className="relative bg-[color:var(--paper)] py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-x-12 gap-y-16 px-6 lg:grid-cols-12 lg:px-10">
        {/* Visual column (mirror — left on desktop, top on mobile) */}
        <div className="relative lg:col-span-7 lg:order-1">
          <Visual />
        </div>

        {/* Text column */}
        <div className="lg:col-span-5 lg:order-2 lg:pl-6">
          <Indicator number={ownership.indicator} />
          <SectionLabel tone="light" className="mt-10">
            {ownership.label}
          </SectionLabel>
          <h2 className="font-display v3-headline mt-6 text-[36px] leading-[1.02] tracking-[-0.03em] sm:text-[44px] lg:text-[52px]">
            {ownership.headline.lead}{" "}
            <span className="v3-italic text-[color:var(--ink-soft)]">
              {ownership.headline.accent}
            </span>
          </h2>
          <p className="mt-6 max-w-[44ch] text-[15px] leading-[1.7] text-[color:var(--ink-soft)] lg:text-[16px]">
            {ownership.body}
          </p>
          <ul className="mt-7 space-y-3.5">
            {ownership.bullets.map((b) => (
              <li
                key={b}
                className="flex items-start gap-3 text-[13.5px] leading-[1.55] text-[color:var(--ink-soft)]"
              >
                <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-[color:var(--accent-soft)] text-[color:var(--accent)]">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Indicator({ number }: { number: string }) {
  return (
    <div className="inline-flex flex-col items-start gap-3">
      <span className="font-display text-[13px] font-medium leading-none tabular-nums tracking-[-0.005em] text-[color:var(--ink-muted)]">
        {number}
      </span>
      <span aria-hidden className="block h-14 w-px bg-[color:var(--accent)]" />
      <span
        aria-hidden
        className="block h-[5px] w-3 bg-[color:var(--accent)]"
      />
    </div>
  );
}

function Visual() {
  return (
    <div className="relative isolate">
      {/* Halftone wallpaper behind */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-4 -inset-y-8 z-0 opacity-50"
      >
        <HalftoneFigure
          variant="wallpaper-right"
          width={680}
          height={460}
          density={6}
          className="h-full w-full"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-[560px]">
        <div className="relative overflow-hidden rounded-[14px] border border-[color:var(--ink-line)] bg-white shadow-pop">
          <PlusCorner position="tl" tone="light" size={12} />
          <PlusCorner position="tr" tone="light" size={12} />
          <PlusCorner position="bl" tone="light" size={12} />
          <PlusCorner position="br" tone="light" size={12} />

          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/70 px-4 py-2.5">
            <span className="h-[10px] w-[10px] rounded-full bg-[#FF5F57]" />
            <span className="h-[10px] w-[10px] rounded-full bg-[#FEBC2E]" />
            <span className="h-[10px] w-[10px] rounded-full bg-[#28C840]" />
            <span className="flex-1 text-center font-display text-[11px] font-medium text-[color:var(--ink-muted)]">
              Settings · Data
            </span>
            <span className="w-12" />
          </div>

          <div className="px-6 py-6">
            <div className="quiet-caps text-[10px] tracking-[0.16em] text-[color:var(--ink-muted)]">
              Export
            </div>
            <h3 className="mt-2 font-display text-[18px] font-medium leading-[1.3] tracking-[-0.01em]">
              Take your data with you. Anytime.
            </h3>
            <p className="mt-2 text-[12.5px] leading-[1.6] text-[color:var(--ink-muted)]">
              Every customer, proposal, payment, photo, and note — exportable in
              one click.
            </p>

            <div className="mt-5 space-y-2">
              <ExportRow
                Icon={FileJson}
                label="customers.json"
                meta="2,148 records · 1.8 MB"
                ready
              />
              <ExportRow
                Icon={Database}
                label="proposals.csv"
                meta="9,640 records · 6.2 MB"
                ready
              />
              <ExportRow
                Icon={Download}
                label="photos.zip"
                meta="4,310 files · 412 MB"
              />
              <ExportRow
                Icon={Globe}
                label="custom-portal.config"
                meta="domain + branding bundle"
              />
            </div>

            <div className="mt-6 flex items-center justify-between rounded-[8px] border border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/40 px-3 py-2.5 text-[11px]">
              <span className="text-[color:var(--ink-muted)]">
                Last export · 2 days ago
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-[color:var(--ink)]">
                <Download className="h-3 w-3" />
                Download all
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportRow({
  Icon,
  label,
  meta,
  ready,
}: {
  Icon: typeof FileJson;
  label: string;
  meta: string;
  ready?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-[6px] border border-[color:var(--ink-line)] bg-white px-3 py-2 text-[12px]">
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-[5px] bg-[color:var(--paper-deep)] text-[color:var(--ink-soft)]">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
        </span>
        <div className="flex flex-col">
          <span className="font-medium tracking-[-0.005em] text-[color:var(--ink)]">
            {label}
          </span>
          <span className="text-[10px] text-[color:var(--ink-faint)]">
            {meta}
          </span>
        </div>
      </div>
      {ready ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--emerald)]/10 px-2 py-0.5 text-[10px] font-medium text-[color:var(--emerald)]">
          Ready
        </span>
      ) : (
        <span className="text-[10px] text-[color:var(--ink-faint)]">Queued</span>
      )}
    </div>
  );
}
