import { CompareSection } from "./compare-section";
import { Reveal } from "./reveal";

/* landing-e (pass B): the intro was one line under the hero mock — no button,
   no note.
 *
   2026-09-18: the comparison moved in here and this line became the heading
   for both. 2026-09-19: the owner turned the first table down and chose the
   schedule from three drafts (compare-section.tsx). With that the truck photo
   went: the section is paper under the drafting grid like the rest of the
   sheet, and the heading is the landing's own h2 pair — eyebrow plus the line
   — as Built for the field sets it. The `#compare` anchor stays here, the
   same on every `?industry=` (the variants swap the hero only). */
export function Intro() {
  return (
    <section id="compare" className="lp-cmpx relative overflow-hidden px-5 py-[8vmin] sm:px-6">
      <div className="relative z-[1] mx-auto lp-wrap">
        <Reveal>
          <div className="max-w-[46rem]">
            <h2 className="lp-eyebrow text-[#666666]">Compared</h2>
            <p className="mt-5 text-[clamp(32px,4.4vw,56px)] font-bold leading-[1.06] tracking-[-0.02em] text-ink">
              Quote, book, invoice, get paid — one app.
            </p>
          </div>
        </Reveal>
        <CompareSection />
      </div>
    </section>
  );
}
