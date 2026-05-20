import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bot,
  CalendarClock,
  CircleDollarSign,
  Database,
  Hammer,
  HardHat,
  Inbox,
  MessageSquare,
  Receipt,
  Star,
  Webhook,
} from "lucide-react";
import { buildingBlocks } from "@/lib/v3/landing-copy";
import { SectionLabel } from "./_primitives/SectionLabel";
import { PlusCorner } from "./_primitives/PlusCorner";

const ICON_MAP: Record<string, LucideIcon> = {
  leads: Inbox,
  proposals: BadgeCheck,
  jobs: HardHat,
  invoices: Receipt,
  ai: Bot,
  meta: Star,
  sms: MessageSquare,
  webhooks: Webhook,
  crew: Hammer,
  reviews: CircleDollarSign,
  payments: CalendarClock,
  skills: Database,
};

export function BuildingBlocks01() {
  return (
    <section className="relative bg-[color:var(--paper)] py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-x-12 gap-y-16 px-6 lg:grid-cols-12 lg:px-10">
        {/* Indicator + headline column */}
        <div className="lg:col-span-5">
          <Indicator number={buildingBlocks.indicator} />
          <SectionLabel tone="light" className="mt-10">
            {buildingBlocks.label}
          </SectionLabel>
          <h2 className="font-display v3-headline mt-6 text-[36px] leading-[1.02] tracking-[-0.03em] sm:text-[44px] lg:text-[52px]">
            {buildingBlocks.headline.lead}{" "}
            <span className="v3-italic text-[color:var(--ink-soft)]">
              {buildingBlocks.headline.accent}
            </span>
          </h2>
          <p className="mt-6 max-w-[44ch] text-[15px] leading-[1.7] text-[color:var(--ink-soft)] lg:text-[16px]">
            {buildingBlocks.body}
          </p>
        </div>

        {/* Module visual column */}
        <div className="relative lg:col-span-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-8 top-12 hidden h-[80%] w-32 opacity-60 lg:block"
            style={{
              backgroundImage:
                "radial-gradient(circle at 30% 50%, rgba(79,70,229,0.1), transparent 60%)",
            }}
          />
          <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {buildingBlocks.groups.map((group) => (
              <GroupCard
                key={group.label}
                label={group.label}
                modules={group.modules}
              />
            ))}
          </div>
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
      <span
        aria-hidden
        className="ml-[5.5px] block h-3 w-px border-l border-dashed border-[color:var(--ink-line)]"
      />
    </div>
  );
}

function GroupCard({
  label,
  modules,
}: {
  label: string;
  modules: { icon: string; label: string }[];
}) {
  return (
    <div className="relative rounded-[14px] bg-[color:var(--ink)] p-4 text-[color:var(--paper)] shadow-pop">
      <PlusCorner position="tl" tone="dark" size={10} />
      <PlusCorner position="tr" tone="dark" size={10} />
      <PlusCorner position="bl" tone="dark" size={10} />
      <PlusCorner position="br" tone="dark" size={10} />

      <div className="quiet-caps mb-3 px-1 text-[10px] tracking-[0.16em] text-[color:var(--ink-faint)]">
        {label}
      </div>

      <ul className="space-y-2">
        {modules.map((m) => {
          const Icon = ICON_MAP[m.icon] ?? Database;
          return (
            <li
              key={m.label}
              className="group/pill flex items-center gap-2.5 rounded-[8px] border border-white/8 bg-white/[0.06] px-3 py-2.5 text-[12.5px] transition-colors hover:bg-white/[0.1]"
            >
              <span className="grid h-6 w-6 place-items-center rounded-[6px] bg-[color:var(--accent)]/15 text-[color:var(--accent-soft)]">
                <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
              </span>
              <span className="font-medium tracking-[-0.005em]">{m.label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
