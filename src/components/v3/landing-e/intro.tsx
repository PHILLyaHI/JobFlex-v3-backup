import { CompareSection } from "./compare-section";
import { Reveal } from "./reveal";

/* landing-e (pass B): the intro was one line under the hero mock — no button,
   no note.
 *
   2026-09-18: the comparison table moved in here, and this line became the
   heading for both. It used to sit on its own between Stats and the field
   pitch under an "AT A GLANCE" eyebrow and a "How JobFlex compares" heading —
   two headings making the same claim, a hundred vertical pixels apart. Now the
   claim is made once, in the one-app line, and the table is what backs it up.
   The `#compare` anchor moved with it, so every link into the comparison still
   lands here, on every `?industry=` variant (the variants swap the hero only,
   and this section is the same for all of them). */
export function Intro() {
  return (
    <section id="compare" className="lp-intro relative overflow-hidden bg-white px-5 py-[6vmin] sm:px-6">
      <div className="lp-bg lp-bg--truck" aria-hidden data-lazy />
      <div className="relative z-[1] mx-auto lp-wrap">
        <Reveal>
          <h2 className="max-w-[52rem] text-[17px] font-semibold leading-[1.4] tracking-[-0.01em] text-ink sm:text-[clamp(19px,1.6vw,22px)]">
            Quote, book, invoice, get paid — one app.
          </h2>
        </Reveal>
        <CompareSection />
      </div>
    </section>
  );
}
