import { Logo } from "./logo";
import { REGISTER } from "./routes";
import { Reveal } from "./reveal";

const COLUMNS: [string, string[]][] = [
  ["Product", ["CRM & leads", "AI estimator", "Proposals", "Scheduling", "Invoicing", "Client portal"]],
  ["Field crews", ["Crew portal", "Mobile app", "Photo tools", "Receipt scanner", "Job checklists"]],
  ["Resources", ["Help center", "Pricing guides", "Estimate templates", "Contractor blog", "Webinars"]],
  ["Comparisons", ["JobFlex vs spreadsheets", "JobFlex vs Jobber", "JobFlex vs Buildertrend", "JobFlex vs pen & paper"]],
  ["Support", ["Contact us", "System status", "API docs", "Security", "Terms & privacy"]],
];

/* Only the routes that actually exist are wired; the rest of the site map is
   still placeholder copy and stays inert rather than 404ing. */
const FOOT_HREF: Record<string, string> = {
  About: "/about",
  Pricing: "/pricing",
  "Terms & privacy": "/terms",
  "Client portal": "/homeowner",
};

export function CtaFooter() {
  return (
    <section className="relative overflow-hidden bg-lp-base px-5 text-white sm:px-6">
      <div className="lp-bg lp-bg--roofs" aria-hidden />
      {/* Final CTA */}
      <div id="final-cta" className="relative z-[1] mx-auto flex max-w-[86rem] flex-col items-center py-[12vmin] text-center max-sm:pb-[22vmin] max-sm:pt-[16vmin]">
        <Reveal>
          <h2 className="lp-eyebrow text-lp-sky">Run a tighter shop</h2>
          <p className="mx-auto mt-8 max-w-[54rem] text-[clamp(30px,4vw,56px)] font-bold leading-[1.12] tracking-[-0.02em] text-slate-500">
            Last week, <span className="text-white">4,812 estimates</span> went
            out the door through JobFlex.
          </p>
          <p className="mt-3 text-[clamp(30px,4vw,56px)] font-bold leading-[1.1] tracking-[-0.02em] text-white">
            Today, it&rsquo;s your turn.
          </p>
          {/* One button, both viewports (owner, 2026-08-25). The white mobile
              variant and the blue one were rendering together — `.jf-lp
              .lp-btn-lime` sets display and outranks Tailwind's `hidden` — and
              two primaries stacked is a choice, not a CTA. Blue keeps the page
              on one accent and is the only colour in this black section. */}
          <div className="mt-10 w-full sm:mt-12 sm:w-auto">
            <a href={REGISTER} className="lp-btn-lime w-full sm:w-auto">
              Start 14-Day Free Trial
              <span aria-hidden>→</span>
            </a>
          </div>
        </Reveal>
      </div>

      {/* Footer */}
      <footer className="relative z-[1] border-t border-white/[0.07]">
        <div className="mx-auto lp-wrap pb-24 pt-14 md:pb-14 md:pt-12">
          <div className="flex flex-wrap items-center justify-between gap-4 md:gap-6">
            <div className="flex flex-wrap items-center gap-5 md:gap-9">
              <Logo dark />
              {["About", "Features", "Careers", "Resources"].map((l) => (
                <a
                  key={l}
                  href={FOOT_HREF[l] ?? "#"}
                  className="hidden text-[15px] font-medium text-white/70 transition-colors hover:text-white md:inline"
                >
                  {l}
                </a>
              ))}
            </div>
            <span className="flex items-center overflow-hidden rounded-md ring-1 ring-white/15">
              <span className="flex items-center gap-1.5 bg-white/[0.08] px-2.5 py-1 text-[11.5px] font-semibold md:px-3 md:py-1.5 md:text-[12.5px]">
                <span className="text-lp-gold" aria-hidden>★</span> 4.9
              </span>
              <span className="px-2.5 py-1 text-[11.5px] font-semibold text-white/60 md:px-3 md:py-1.5 md:text-[12.5px]">
                2,300+ contractor reviews
              </span>
            </span>
          </div>

          {/* Mobile: one compact link row */}
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-1 md:hidden">
            {["Pricing", "Help center", "Contact", "Security", "API docs"].map((l) => (
              <a
                key={l}
                href={FOOT_HREF[l] ?? "#"}
                className="py-2 text-[13.5px] font-medium text-white/55 transition-colors hover:text-white"
              >
                {l}
              </a>
            ))}
          </div>

          <div className="mt-8 hidden grid-cols-2 gap-x-6 gap-y-7 md:mt-14 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-12 lg:grid-cols-5">
            {COLUMNS.map(([title, links]) => (
              <div key={title}>
                <div className="text-[12.5px] font-bold text-white md:text-[15px]">{title}</div>
                <ul className="mt-2 md:mt-4">
                  {links.map((l) => (
                    <li key={l}>
                      <a
                        href={FOOT_HREF[l] ?? "#"}
                        className="block py-[5px] text-[12.5px] text-white/45 transition-colors hover:text-white md:py-[5px] md:text-[14px]"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[11.5px] text-white/35 md:mt-16 md:pt-8 md:text-[13px]">
            <span>
              © 2026 JobFlex
              <span className="hidden md:inline">
                {" "}
                — The operating system for small-shop contractors.
              </span>
            </span>
            <span className="flex gap-6">
              <a href="/terms" className="py-2 transition-colors hover:text-white md:py-0">Terms</a>
              <a href="/privacy" className="py-2 transition-colors hover:text-white md:py-0">Privacy</a>
              <a href="#" className="py-2 transition-colors hover:text-white md:py-0">Status</a>
            </span>
          </div>
        </div>
      </footer>
    </section>
  );
}
