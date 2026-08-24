import { DashboardMock } from "./dashboard-mock";
import { Reveal } from "./reveal";

export function Hero() {
  return (
    <>
      <div className="mx-auto mt-[12vmin] flex max-w-[86rem] flex-col items-center gap-3 px-5 text-center sm:mt-[16vmin]">
        <Reveal>
          <a
            href="#"
            className="inline-flex items-center gap-1 rounded-full bg-lp-gold px-4 py-[7px] text-[13px] font-semibold text-lp-ink transition-transform duration-200 hover:scale-[1.03]"
          >
            Just launched: JobFlex AI Estimator
            <span aria-hidden>→</span>
          </a>
        </Reveal>
        <Reveal delay={90}>
          <h1 className="text-[clamp(38px,6.7vw,96px)] font-bold leading-[1.02] tracking-[-0.025em] text-lp-ink">
            Turn your trade
            <br />
            into a business.
          </h1>
        </Reveal>
        <Reveal delay={170} className="w-full sm:w-auto">
          <div className="mx-auto mt-4 flex w-full max-w-[22rem] flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center sm:justify-center">
            <a href="#" className="lp-btn-dark h-12 px-6 text-[16px] font-semibold sm:h-auto sm:py-3 sm:text-[15px]">
              Start free trial
            </a>
            <a
              href="#"
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-md border border-slate-200 bg-white px-6 text-[16px] font-semibold text-lp-ink transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50 sm:h-auto sm:py-3 sm:text-[15px]"
            >
              <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
                <path
                  fill="#FFC107"
                  d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41.4 34.9 44 30 44 24c0-1.3-.1-2.7-.4-3.9z"
                />
              </svg>
              Sign up with Google
            </a>
          </div>
        </Reveal>
      </div>

      <div className="relative mt-[8vmin] px-5 sm:px-6">
        <div className="mx-auto lp-wrap">
          <Reveal delay={150}>
            <div data-parallax="18">
              <DashboardMock />
            </div>
          </Reveal>
        </div>
      </div>
    </>
  );
}
