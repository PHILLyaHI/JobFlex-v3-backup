import { PhoneOverview } from "./blueprint-phone";
import { REGISTER } from "./routes";
import { DashboardMock } from "./dashboard-mock";
import { Reveal } from "./reveal";
import { GoogleSignupButton } from "./google-signup-button";

export function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-bg lp-bg--ridge" aria-hidden />
      <div className="relative z-[1] mx-auto flex max-w-[86rem] flex-col items-center gap-3 px-5 pt-[12vmin] text-center sm:pt-[14vmin]">
        <Reveal>
          <a
            href={REGISTER}
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
            <a href={REGISTER} className="lp-btn-dark lp-cta lp-cta--solid">
              Start 14-Day Free Trial
            </a>
            <GoogleSignupButton className="lp-cta lp-cta--ghost">
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
            </GoogleSignupButton>
          </div>
        </Reveal>
      </div>

      <div className="relative z-[1] mt-[8vmin] px-5 pb-[26vmin] sm:px-6">
        {/* Two builds of the same screen, not one build clipped: the desktop
            plate's 208px sidebar and four-across KPI row cannot survive a
            phone column (owner, 2026-08-25). The phone build also skips
            lp-wrap, whose gutter would double the section's own px-5. */}
        <Reveal delay={150} className="sm:hidden">
          <PhoneOverview />
        </Reveal>
        <div className="mx-auto hidden lp-wrap sm:block">
          <Reveal delay={150}>
            <div data-parallax="18">
              <DashboardMock />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
