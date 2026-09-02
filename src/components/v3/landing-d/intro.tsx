import { REGISTER } from "./routes";
import { Reveal } from "./reveal";

export function Intro() {
  return (
    <div className="lp-intro relative overflow-hidden bg-white px-5 pb-[12vmin] pt-[11vmin] sm:px-6">
      {/* Same treatment as the hero: a real jobsite behind the words, held down
          to a whisper so the type keeps its contrast (owner, 2026-08-24). */}
      <div className="lp-bg lp-bg--truck" aria-hidden />
      <div className="relative z-[1] mx-auto lp-wrap">
        <Reveal>
          <p className="max-w-[52rem] text-[clamp(24px,2.6vw,36px)] font-semibold leading-[1.32] tracking-[-0.01em] text-lp-ink">
            JobFlex runs the business side of your trade. Quote the job, book the
            crew, send the invoice, get paid — all in one app.
          </p>
          <a href={REGISTER} className="lp-btn-lime mt-9 inline-flex">
            Try it free for 14 days
          </a>
        </Reveal>
      </div>
    </div>
  );
}
