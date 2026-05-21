import { finalCta } from "@/lib/v3/landing-copy";
import { BevelButton } from "./_primitives/BevelButton";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";
import { SectionLabel } from "./_primitives/SectionLabel";
import { Reveal } from "./_primitives/Reveal";

export function FinalCTA() {
  return (
    <section className="relative isolate overflow-hidden bg-[color:var(--ink)] pb-16 pt-32 lg:pb-20 lg:pt-40">
      {/* Halftone wallpaper — bleeds into FAQ below */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute inset-y-0 left-[-6%] w-[42%]">
          <HalftoneFigure
            variant="wallpaper-left"
            width={520}
            height={720}
            color="var(--accent)"
            density={5}
            className="h-full w-full"
          />
        </div>
        <div className="absolute inset-y-0 right-[-6%] w-[42%]">
          <HalftoneFigure
            variant="wallpaper-right"
            width={520}
            height={720}
            color="var(--accent)"
            density={5}
            className="h-full w-full"
          />
        </div>
        <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-t from-[color:var(--ink)] via-[color:var(--ink)]/85 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-[1200px] px-6 lg:px-10">
        <div className="max-w-3xl">
          <Reveal>
            <SectionLabel tone="dark">{finalCta.label}</SectionLabel>
          </Reveal>
          <Reveal delay={0.12} duration={0.7}>
            <h2 className="font-display v3-headline mt-7 text-[40px] leading-[1.04] tracking-[-0.03em] text-[color:var(--paper)] sm:text-[56px] lg:text-[68px]">
              {finalCta.headline.lead}{" "}
              <span className="v3-italic text-[color:var(--paper)]/80">
                {finalCta.headline.accent}
              </span>
            </h2>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <BevelButton
                href={finalCta.ctas.primary.href}
                size="lg"
                variant="filled"
                tone="dark"
              >
                {finalCta.ctas.primary.label}
              </BevelButton>
              <BevelButton
                href={finalCta.ctas.secondary.href}
                size="lg"
                variant="outline"
                tone="dark"
              >
                {finalCta.ctas.secondary.label}
              </BevelButton>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
