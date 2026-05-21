import {
  Calculator,
  Camera,
  Command,
  HardHat,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
} from "lucide-react";
import { gtmFeatures } from "@/lib/v3/landing-copy";
import { SectionLabel } from "./_primitives/SectionLabel";
import { PlusCorner } from "./_primitives/PlusCorner";
import { Reveal, RevealStagger } from "./_primitives/Reveal";

export function GTMFeatures() {
  return (
    <section className="relative bg-[color:var(--paper)] py-24 lg:py-32">
      <div className="mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="max-w-2xl">
          <Reveal>
            <SectionLabel tone="light">{gtmFeatures.label}</SectionLabel>
          </Reveal>
          <Reveal delay={0.1} duration={0.7}>
            <h2 className="font-display v3-headline mt-6 text-[36px] leading-[1.04] tracking-[-0.03em] sm:text-[44px] lg:text-[54px]">
              {gtmFeatures.headline.lead}{" "}
              <span className="v3-italic text-[color:var(--ink-soft)]">
                {gtmFeatures.headline.accent}
              </span>
            </h2>
          </Reveal>
          <Reveal delay={0.22}>
            <p className="mt-6 max-w-[52ch] text-[15.5px] leading-[1.7] text-[color:var(--ink-soft)]">
              {gtmFeatures.body}
            </p>
          </Reveal>
        </div>

        <RevealStagger
          className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3"
          delay={0.3}
          step={0.1}
        >
          <FeatureCard
            eyebrow={gtmFeatures.cards[0].eyebrow}
            title={gtmFeatures.cards[0].title}
            body={gtmFeatures.cards[0].body}
          >
            <KanbanPreview />
          </FeatureCard>
          <FeatureCard
            eyebrow={gtmFeatures.cards[1].eyebrow}
            title={gtmFeatures.cards[1].title}
            body={gtmFeatures.cards[1].body}
          >
            <AIEstimatorPreview />
          </FeatureCard>
          <FeatureCard
            eyebrow={gtmFeatures.cards[2].eyebrow}
            title={gtmFeatures.cards[2].title}
            body={gtmFeatures.cards[2].body}
          >
            <CommandPalettePreview />
          </FeatureCard>
        </RevealStagger>
      </div>
    </section>
  );
}

function FeatureCard({
  eyebrow,
  title,
  body,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article className="group relative overflow-hidden bg-white shadow-card transition-shadow duration-200 hover:shadow-pop">
      <div
        aria-hidden
        className="absolute inset-0 border border-[color:var(--ink-line)]"
      />
      <PlusCorner position="tl" size={10} tone="light" />
      <PlusCorner position="tr" size={10} tone="light" />
      <PlusCorner position="bl" size={10} tone="light" />
      <PlusCorner position="br" size={10} tone="light" />

      <div className="relative h-[200px] overflow-hidden border-b border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/40 p-4">
        {children}
      </div>

      <div className="relative px-6 py-6">
        <div className="quiet-caps text-[10px] tracking-[0.16em] text-[color:var(--accent)]">
          {eyebrow}
        </div>
        <h3 className="mt-2 font-display text-[18px] font-medium leading-[1.3] tracking-[-0.01em] text-[color:var(--ink)]">
          {title}
        </h3>
        <p className="mt-2.5 text-[13px] leading-[1.6] text-[color:var(--ink-muted)]">
          {body}
        </p>
      </div>
    </article>
  );
}

/* ─── Preview 1: Kanban ────────────────────────────────────────── */

const KANBAN_COLUMNS = [
  { title: "Estimating", count: 4, items: [
    { lead: "Patel · roof", value: "$18.4k", tone: "accent" as const },
    { lead: "Nguyen · deck", value: "$12.8k" },
  ]},
  { title: "Proposal sent", count: 6, items: [
    { lead: "Okafor · fence", value: "$8.9k", tone: "amber" as const },
  ]},
  { title: "Scheduled", count: 3, items: [
    { lead: "Diaz · kitchen", value: "$45.3k", tone: "emerald" as const },
  ]},
];

function KanbanPreview() {
  return (
    <div className="grid h-full grid-cols-3 gap-2 text-[10px]">
      {KANBAN_COLUMNS.map((c, ci) => (
        <div
          key={c.title}
          className="flex flex-col gap-1.5 rounded-[6px] border border-[color:var(--ink-line)] bg-white p-2"
        >
          <div className="flex items-center justify-between">
            <span className="font-medium text-[color:var(--ink)]">{c.title}</span>
            <span className="text-[color:var(--ink-faint)]">{c.count}</span>
          </div>
          {c.items.map((item, ii) => (
            <div
              key={item.lead}
              className={
                "flex flex-col gap-1 rounded-[5px] border border-[color:var(--ink-line)] bg-[color:var(--paper-deep)]/40 p-1.5 transition-transform duration-300 " +
                (ci === 0 && ii === 0
                  ? "rotate-[-1.5deg] shadow-card group-hover:rotate-0"
                  : "")
              }
            >
              <span className="text-[9px] uppercase tracking-[0.06em] text-[color:var(--ink-faint)]">
                {item.lead.split(" · ")[1]}
              </span>
              <span className="truncate font-medium text-[color:var(--ink)]">
                {item.lead.split(" · ")[0]}
              </span>
              <span
                className={
                  "tabular text-[9px] " +
                  (item.tone === "accent"
                    ? "text-[color:var(--accent)]"
                    : item.tone === "amber"
                      ? "text-[color:var(--amber)]"
                      : item.tone === "emerald"
                        ? "text-[color:var(--emerald)]"
                        : "text-[color:var(--ink-muted)]")
                }
              >
                {item.value}
              </span>
            </div>
          ))}
          {ci === 1 ? (
            <div className="mt-1 grid place-items-center rounded-[5px] border border-dashed border-[color:var(--ink-line)] py-2 text-[9px] text-[color:var(--ink-faint)]">
              + drop here
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ─── Preview 2: AI Estimator ──────────────────────────────────── */

function AIEstimatorPreview() {
  return (
    <div className="grid h-full grid-cols-[1fr_1.1fr] gap-2 text-[10px]">
      <div className="flex flex-col gap-1.5 rounded-[6px] border border-[color:var(--ink-line)] bg-white p-2">
        <div className="quiet-caps text-[8px] tracking-[0.14em] text-[color:var(--ink-faint)]">
          Scope notes
        </div>
        <p className="text-[10px] leading-[1.5] text-[color:var(--ink-soft)]">
          28 sq, GAF Timberline HDZ, tear-off
          incl. Chimney flash, 2x ridge vents.
        </p>
        <div className="mt-auto flex items-center gap-1.5 rounded-[4px] bg-[color:var(--accent-soft)] px-1.5 py-1 text-[color:var(--accent-ink)]">
          <Camera className="h-3 w-3" strokeWidth={1.5} />
          <span className="text-[9px] font-medium">4 photos attached</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5 rounded-[6px] border border-[color:var(--ink-line)] bg-white p-2">
        <div className="flex items-center justify-between">
          <div className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3 text-[color:var(--accent)]" strokeWidth={1.5} />
            <span className="text-[9px] font-medium text-[color:var(--ink)]">AI Roof</span>
          </div>
          <span className="rounded-full bg-[color:var(--emerald)]/10 px-1.5 py-0.5 text-[8px] font-medium text-[color:var(--emerald)]">
            Drafted
          </span>
        </div>
        <Row label="GAF Timberline HDZ" value="$4,820" />
        <Row label="Underlayment" value="$640" />
        <Row label="Tear-off + dump" value="$1,200" />
        <Row label="Labor · 2.5 days" value="$3,400" tone="accent" />
        <div className="mt-auto flex items-center justify-between border-t border-[color:var(--ink-line)] pt-1.5">
          <span className="text-[9px] text-[color:var(--ink-muted)]">
            Total
          </span>
          <span className="tabular text-[12px] font-medium text-[color:var(--ink)]">
            $18,444
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div className="flex items-center justify-between text-[9.5px]">
      <span className="truncate text-[color:var(--ink-muted)]">{label}</span>
      <span
        className={
          "tabular " +
          (tone === "accent"
            ? "text-[color:var(--accent)]"
            : "text-[color:var(--ink-soft)]")
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ─── Preview 3: Command palette ──────────────────────────────── */

function CommandPalettePreview() {
  return (
    <div className="flex h-full flex-col items-stretch justify-center">
      <div className="mx-auto w-full max-w-[260px] overflow-hidden rounded-[10px] border border-[color:var(--ink-line)] bg-white shadow-pop">
        <div className="flex items-center gap-2 border-b border-[color:var(--ink-line)] px-3 py-2">
          <Command className="h-3 w-3 text-[color:var(--ink-faint)]" />
          <span className="text-[11px] text-[color:var(--ink-soft)]">
            Patel
          </span>
          <span className="ml-auto rounded-[3px] border border-[color:var(--ink-line)] px-1 text-[8px] text-[color:var(--ink-faint)]">
            ⌘K
          </span>
        </div>
        <ul className="divide-y divide-[color:var(--ink-line)] text-[10.5px]">
          <CommandRow
            Icon={Send}
            label="Send proposal to Patel · roof"
            shortcut="↵"
            active
          />
          <CommandRow Icon={Phone} label="Call Patel — (215) 555-0144" />
          <CommandRow Icon={MessageSquare} label="SMS Patel · ready to schedule?" />
          <CommandRow Icon={HardHat} label="Dispatch Crew B to Patel job" />
          <CommandRow Icon={Calculator} label="Open AI Roof estimator for Patel" />
        </ul>
      </div>
    </div>
  );
}

function CommandRow({
  Icon,
  label,
  shortcut,
  active,
}: {
  Icon: typeof Send;
  label: string;
  shortcut?: string;
  active?: boolean;
}) {
  return (
    <li
      className={
        "flex items-center gap-2 px-3 py-1.5 " +
        (active ? "bg-[color:var(--accent)]/8" : "")
      }
    >
      <span
        className={
          "grid h-5 w-5 place-items-center rounded-[4px] " +
          (active
            ? "bg-[color:var(--accent)]/15 text-[color:var(--accent)]"
            : "bg-[color:var(--paper-deep)] text-[color:var(--ink-faint)]")
        }
      >
        <Icon className="h-2.5 w-2.5" strokeWidth={1.5} />
      </span>
      <span className="truncate text-[color:var(--ink)]">{label}</span>
      {shortcut ? (
        <span className="ml-auto rounded-[3px] border border-[color:var(--ink-line)] px-1 text-[8px] text-[color:var(--ink-faint)]">
          {shortcut}
        </span>
      ) : null}
    </li>
  );
}

