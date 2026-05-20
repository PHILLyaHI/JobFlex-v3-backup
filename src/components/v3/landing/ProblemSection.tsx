import { problem } from "@/lib/v3/landing-copy";
import { HalftoneFigure } from "./_primitives/HalftoneFigure";
import { SectionLabel } from "./_primitives/SectionLabel";
import { PlusCorner } from "./_primitives/PlusCorner";
import { CrosshairMarker } from "./_primitives/CrosshairMarker";

export function ProblemSection() {
  return (
    <section className="relative bg-[color:var(--paper)] py-24 lg:py-32">
      <div className="mx-auto grid max-w-[1280px] grid-cols-1 gap-x-12 gap-y-16 px-6 lg:grid-cols-12 lg:px-10">
        {/* Halftone figure */}
        <div className="relative lg:col-span-5">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[420px]">
            <PlusCorner position="tl" tone="light" size={11} />
            <PlusCorner position="tr" tone="light" size={11} />
            <PlusCorner position="bl" tone="light" size={11} />
            <PlusCorner position="br" tone="light" size={11} />
            <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
              <HalftoneFigure
                variant="monolith"
                width={420}
                height={520}
                color="var(--ink)"
                density={6}
                className="h-full w-full"
                ariaLabel="A stylized monolith silhouette representing tool sprawl"
              />
            </div>
            <span className="quiet-caps absolute -bottom-8 left-0 inline-flex items-center gap-2 text-[color:var(--ink-faint)]">
              <CrosshairMarker size={9} />
              The monolith — assembled from eight tabs and one notebook.
            </span>
          </div>
        </div>

        {/* Text column */}
        <div className="lg:col-span-7 lg:pl-6">
          <SectionLabel tone="light">{problem.label}</SectionLabel>
          <h2 className="font-display v3-headline mt-6 text-[36px] leading-[1.02] tracking-[-0.03em] sm:text-[44px] lg:text-[54px]">
            {problem.headline.lead}{" "}
            <span className="v3-italic text-[color:var(--ink-soft)]">
              {problem.headline.accent}
            </span>
          </h2>
          <p className="mt-7 max-w-[44ch] text-[15.5px] leading-[1.7] text-[color:var(--ink-soft)] lg:text-[16px]">
            {problem.body}
          </p>

          <div className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2">
            {problem.points.map((p) => (
              <div key={p.title} className="relative pt-5">
                <span
                  aria-hidden
                  className="absolute left-0 right-12 top-0 h-px bg-[color:var(--ink-line)]"
                />
                <h3 className="font-display text-[14px] font-medium tracking-[-0.005em] text-[color:var(--ink)]">
                  {p.title}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.65] text-[color:var(--ink-muted)]">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
