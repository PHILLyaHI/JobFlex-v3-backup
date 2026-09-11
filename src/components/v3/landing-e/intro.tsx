import { Reveal } from "./reveal";

/* landing-e (pass B): the intro is one line under the hero mock — no button,
   no note. */
export function Intro() {
  return (
    <div className="lp-intro relative overflow-hidden bg-white px-5 py-[6vmin] sm:px-6">
      <div className="lp-bg lp-bg--truck" aria-hidden data-lazy />
      <div className="relative z-[1] mx-auto lp-wrap">
        <Reveal>
          <p className="max-w-[52rem] text-[17px] font-semibold leading-[1.4] tracking-[-0.01em] text-lp-ink sm:text-[clamp(19px,1.6vw,22px)]">
            Quote, book, invoice, get paid — one app.
          </p>
        </Reveal>
      </div>
    </div>
  );
}
