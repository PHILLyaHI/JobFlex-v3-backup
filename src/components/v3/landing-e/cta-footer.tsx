import { CookieSettingsLink, DoNotSellLink } from "@/components/consent/cookie-settings-link";
import { CtaNote } from "./cta-note";
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

/* Only the routes that actually exist are wired. Since CRO stage 2
   (2026-09-09) a link without a route is not rendered at all — no "#" that
   scrolls to the top — so the columns and rows below show only what opens.
   COLUMNS keeps the whole planned site map for the day the pages exist. */
const FOOT_HREF: Record<string, string> = {
  About: "/about",
  Pricing: "/pricing",
  "Terms & privacy": "/terms",
  "Client portal": "/homeowner",
};

export function CtaFooter({
  registerHref = REGISTER,
  cta,
}: {
  registerHref?: string;
  /** A trade variant's primary CTA words; the default page keeps its own. */
  cta?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-lp-base px-5 text-white sm:px-6">
      <div className="lp-bg lp-bg--roofs" aria-hidden data-lazy />
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
            <a href={registerHref} className="lp-btn-lime w-full sm:w-auto" data-cta="footer">
              {cta ?? "Start 14-Day Free Trial"}
              <span aria-hidden>→</span>
            </a>
            <CtaNote tone="dark" className="mt-3 text-center" />
          </div>
        </Reveal>
      </div>

      {/* Footer */}
      <footer className="relative z-[1] border-t border-white/[0.07]">
        <div className="mx-auto lp-wrap pb-24 pt-14 md:pb-14 md:pt-12">
          <div className="flex flex-wrap items-center justify-between gap-4 md:gap-6">
            <div className="flex flex-wrap items-center gap-5 md:gap-9">
              <Logo dark />
              {["About", "Features", "Careers", "Resources"].filter((l) => FOOT_HREF[l]).map((l) => (
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
              <span className="flex items-center gap-1.5 bg-white/[0.08] px-2.5 py-1 text-[15px] font-semibold md:px-3 md:py-1.5 md:text-[14px]">
                <span className="text-lp-gold" aria-hidden>★</span> 4.9
              </span>
              <span className="px-2.5 py-1 text-[15px] font-semibold text-white/60 md:px-3 md:py-1.5 md:text-[14px]">
                2,300+ contractor reviews
              </span>
            </span>
          </div>

          {/* Mobile: one compact link row */}
          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-1 md:hidden">
            {["Pricing", "Help center", "Contact", "Security", "API docs"].filter((l) => FOOT_HREF[l]).map((l) => (
              <a
                key={l}
                href={FOOT_HREF[l] ?? "#"}
                className="py-2 text-[15px] font-medium text-white/70 transition-colors hover:text-white"
              >
                {l}
              </a>
            ))}
          </div>

          <div className="mt-8 hidden grid-cols-2 gap-x-6 gap-y-7 md:mt-14 md:grid md:grid-cols-3 md:gap-x-8 md:gap-y-12 lg:grid-cols-5">
            {COLUMNS.map(([title, links]) => [title, links.filter((l) => FOOT_HREF[l])] as const).filter(([, links]) => links.length > 0).map(([title, links]) => (
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

          {/* The legal row carries the two consent links (2026-09-10), so it
              is read, not just present: 14 px, white/60 (5.6:1 on the ink),
              and the links wrap on a phone instead of running off the edge. */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[15px] text-white/60 md:mt-16 md:pt-8 md:text-[14px]">
            <span>
              © 2026 JobFlex
              <span className="hidden md:inline">
                {" "}
                — The operating system for small-shop contractors.
              </span>
            </span>
            <span className="flex flex-wrap gap-x-6 gap-y-0">
              <a href="/terms" className="py-2 transition-colors hover:text-white md:py-0">Terms</a>
              <a href="/privacy" className="py-2 transition-colors hover:text-white md:py-0">Privacy</a>
              <CookieSettingsLink className="py-2 transition-colors hover:text-white md:py-0" />
              <DoNotSellLink className="py-2 text-left transition-colors hover:text-white md:py-0" />

            </span>
          </div>
        </div>
      </footer>
    </section>
  );
}
