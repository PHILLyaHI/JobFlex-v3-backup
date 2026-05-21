import { ArrowUpRight } from "lucide-react";
import { customers } from "@/lib/v3/landing-copy";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";
import { SectionLabel } from "./_primitives/SectionLabel";
import { PlusCorner } from "./_primitives/PlusCorner";
import { Reveal, RevealStagger } from "./_primitives/Reveal";

export function CustomersStrip() {
  return (
    <section className="relative isolate overflow-hidden bg-[color:var(--ink)] pb-32 pt-28 lg:pb-40 lg:pt-32">
      {/* Dotted ambient wallpaper */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />

      <div className="relative mx-auto max-w-[1320px] px-6 lg:px-10">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <div className="inline-flex">
              <SectionLabel tone="dark">{customers.label}</SectionLabel>
            </div>
          </Reveal>
          <Reveal delay={0.12} duration={0.7}>
            <h2 className="font-display v3-headline mt-6 text-[40px] leading-[1.04] tracking-[-0.03em] text-[color:var(--paper)] sm:text-[56px] lg:text-[68px]">
              {customers.headline.lead}{" "}
              <span className="v3-italic text-[color:var(--paper)]/85">
                {customers.headline.accent}
              </span>
            </h2>
          </Reveal>
        </div>

        <RevealStagger
          className="relative mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:mt-16"
          delay={0.25}
          step={0.12}
        >
          {customers.cards.map((c, i) => (
            <CustomerCard
              key={c.brand}
              brand={c.brand}
              title={c.title}
              body={c.body}
              cta={c.cta}
              accent={c.accent}
              offset={i % 2 === 0 ? "down" : "up"}
            />
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}

function CustomerCard({
  brand,
  title,
  body,
  cta,
  accent,
  offset,
}: {
  brand: string;
  title: string;
  body: string;
  cta: string;
  accent: "emerald" | "amber";
  offset: "up" | "down";
}) {
  const accentColor =
    accent === "emerald" ? "var(--emerald)" : "var(--amber)";
  return (
    <article
      className={
        "group relative overflow-hidden rounded-[14px] border border-white/10 bg-black/30 shadow-pop transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 " +
        (offset === "down" ? "lg:translate-y-8" : "lg:-translate-y-6")
      }
    >
      <PlusCorner position="tl" tone="dark" size={11} />
      <PlusCorner position="tr" tone="dark" size={11} />
      <PlusCorner position="bl" tone="dark" size={11} />
      <PlusCorner position="br" tone="dark" size={11} />

      {/* Brand tag */}
      <div className="absolute left-0 top-0 z-10 inline-flex items-center gap-2 rounded-br-[14px] bg-black/60 px-4 py-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--paper)]">
        <span
          aria-hidden
          className="block h-[5px] w-3"
          style={{ background: accentColor }}
        />
        {brand}
      </div>

      {/* Halftone figure */}
      <div className="relative h-[240px] overflow-hidden border-b border-white/10 bg-black/40">
        <div className="absolute inset-0 flex items-center justify-center">
          <HalftoneFigure
            variant={accent === "emerald" ? "diamond" : "stack"}
            width={420}
            height={220}
            color={accentColor}
            density={5}
          />
        </div>
      </div>

      <div className="relative px-7 py-7">
        <h3 className="font-display text-[22px] font-medium leading-[1.25] tracking-[-0.015em] text-[color:var(--paper)]">
          {title}
        </h3>
        <p className="mt-3 text-[13.5px] leading-[1.65] text-white/65">
          {body}
        </p>
        <button
          type="button"
          className="mt-6 inline-flex items-center gap-2 border border-white/15 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--paper)] transition-colors hover:bg-white/5"
          style={{
            clipPath:
              "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
          }}
        >
          {cta}
          <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
    </article>
  );
}
