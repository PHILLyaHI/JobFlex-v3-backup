import { Reveal } from "./reveal";

export function Intro() {
  return (
    <div className="relative bg-white px-5 pb-[12vmin] pt-[11vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          <p className="max-w-[56rem] text-[clamp(24px,2.6vw,36px)] font-semibold leading-[1.32] tracking-[-0.01em] text-lp-ink">
            JobFlex is a powerful app for small-shop contractors to estimate,
            schedule, and run a business around their work. It comes with
            modern tools to win more jobs, dispatch your crew, track every
            dollar &amp; get paid on time.
          </p>
          <a
            href="#"
            className="lp-arrow-link mt-8 text-[clamp(22px,2.4vw,34px)] font-semibold tracking-[-0.01em] text-slate-500 transition-colors hover:text-slate-700"
          >
            Try JobFlex completely free for 14 days
            <span className="arrow" aria-hidden>
              →
            </span>
          </a>
        </Reveal>
      </div>
    </div>
  );
}
