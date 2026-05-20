import { ArrowUpRight } from "lucide-react";
import { solution } from "@/lib/v3/landing-copy";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";
import { SectionLabel } from "./_primitives/SectionLabel";
import { PlusCorner } from "./_primitives/PlusCorner";

type Variant = "diamond" | "stack" | "spark";

const CARD_VARIANTS: Variant[] = ["stack", "spark", "diamond"];
const CARD_COLORS = [
  "var(--accent)",
  "var(--ink)",
  "var(--emerald)",
] as const;

export function SolutionIntro() {
  return (
    <section className="relative bg-[color:var(--paper)] pb-28 pt-8 lg:pb-40 lg:pt-12">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-10">
        <div className="max-w-2xl">
          <SectionLabel tone="light">{solution.label}</SectionLabel>
          <h2 className="font-display v3-headline mt-6 text-[36px] leading-[1.04] tracking-[-0.03em] sm:text-[44px] lg:text-[56px]">
            {solution.headline.lead}{" "}
            <span className="v3-italic text-[color:var(--ink-soft)]">
              {solution.headline.accent}
            </span>
          </h2>
          <p className="mt-6 max-w-[52ch] text-[15.5px] leading-[1.7] text-[color:var(--ink-soft)] lg:text-[16px]">
            {solution.body}
          </p>
        </div>

        <ul className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3 lg:gap-6">
          {solution.cards.map((card, i) => (
            <Card
              key={card.title}
              title={card.title}
              body={card.body}
              quote={card.quote}
              attribution={card.attribution}
              variant={CARD_VARIANTS[i] ?? "diamond"}
              color={CARD_COLORS[i] ?? CARD_COLORS[0]}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}

function Card({
  title,
  body,
  quote,
  attribution,
  variant,
  color,
}: {
  title: string;
  body: string;
  quote: string;
  attribution: string;
  variant: Variant;
  color: string;
}) {
  return (
    <li className="group relative flex flex-col overflow-hidden bg-white shadow-card transition-shadow duration-200 ease-[cubic-bezier(.22,1,.36,1)] hover:shadow-pop">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[color:var(--ink-line)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-[color:var(--ink-line)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-px bg-[color:var(--ink-line)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[color:var(--ink-line)]"
      />
      <PlusCorner position="tl" size={11} tone="light" />
      <PlusCorner position="tr" size={11} tone="light" />
      <PlusCorner position="bl" size={11} tone="light" />
      <PlusCorner position="br" size={11} tone="light" />

      <div className="px-7 pt-7">
        <h3 className="font-display text-[19px] font-medium leading-[1.25] tracking-[-0.015em] text-[color:var(--ink)]">
          {title}
        </h3>
      </div>

      <div className="relative mt-4 flex h-[140px] items-center justify-center overflow-hidden border-y border-[color:var(--ink-line)]/60 bg-[color:var(--paper-deep)]/30">
        <HalftoneFigure
          variant={variant}
          width={220}
          height={120}
          color={color}
          density={5}
        />
      </div>

      <div className="flex flex-1 flex-col gap-5 px-7 py-6">
        <p className="text-[13.5px] leading-[1.65] text-[color:var(--ink-soft)]">
          {body}
        </p>
        <blockquote className="text-[13px] leading-[1.55] italic text-[color:var(--ink-muted)]">
          &ldquo;{quote}&rdquo;
        </blockquote>
        <div className="mt-auto flex items-center justify-between border-t border-[color:var(--ink-line)] pt-4 text-[11px] uppercase tracking-[0.08em]">
          <span className="text-[color:var(--ink-muted)]">{attribution}</span>
          <span
            aria-hidden
            className="grid h-7 w-7 place-items-center rounded-full text-[color:var(--ink-faint)] transition-all duration-200 group-hover:bg-[color:var(--ink)] group-hover:text-[color:var(--paper)]"
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </li>
  );
}
