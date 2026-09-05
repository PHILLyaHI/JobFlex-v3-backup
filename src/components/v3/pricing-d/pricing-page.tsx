// /pricing — rebuilt in the landing's editorial-blueprint language.
//
// It previously ran the pre-blueprint marketing design (paper-card, font-display,
// the old grey plate) which is why it read as a different product to anyone
// arriving from the landing. Same shell as `/` now: the landing's Nav and
// CtaFooter, the `jf-lp` root and its tokens, so the two pages are one site.
//
// EVERY NUMBER IS READ, NEVER WRITTEN. The plans come from the catalog
// (/admin/plans is the single source of truth for every plan surface) and the
// custom plan's price and trial come from lib/customPlan + lib/customPlanConfig
// — the same values the signup step and both checkout routes use. Nothing here
// is a copy an admin edit could leave behind.

import Link from "next/link";
import { Check } from "lucide-react";
import { Nav } from "@/components/v3/landing-d/nav";
import { CtaFooter } from "@/components/v3/landing-d/cta-footer";
import { Reveal } from "@/components/v3/landing-d/reveal";
import { REGISTER } from "@/components/v3/landing-d/routes";
import type { PlanDTO } from "@/lib/planCatalog";
import { CUSTOM_BASE_CENTS, CUSTOM_PAGE_CENTS, CUSTOM_PAGES } from "@/lib/customPlan";
import "@/components/v3/landing-d/landing-d.css";
import "./pricing.css";

/** Whole dollars — every catalog price is a round number, and a trailing ".00"
 *  in 54px type is noise. Falls back to cents only when there are any. */
function price(cents: number): string {
  const d = cents / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

function Plate({ plan, index }: { plan: PlanDTO; index: number }) {
  const hot = plan.highlight;
  return (
    <div className={`pr-plate${hot ? " pr-plate--hot" : ""}`}>
      {hot ? <span className="pr-flag">Most picked</span> : null}
      <span className="pr-no">{String(index + 1).padStart(2, "0")}</span>
      <div className="pr-name">{plan.name}</div>

      <div className="mt-5 flex items-baseline gap-2">
        <span className="pr-amt">{price(plan.priceCents)}</span>
        <span className="pr-per">/ month</span>
      </div>
      <div className="mt-2.5 min-h-[16px]">
        {plan.trialDays > 0 ? <span className="pr-trial">{plan.trialDays}-day free trial</span> : null}
      </div>

      {plan.description ? <p className="pr-desc mt-4">{plan.description}</p> : null}

      <div className="pr-feats mt-6 flex-1">
        {plan.features.map((f) => (
          <div key={f} className="pr-feat">
            <Check className="h-3.5 w-3.5" aria-hidden />
            <span>{f}</span>
          </div>
        ))}
      </div>

      <Link href={REGISTER as never} className="pr-cta mt-7">
        {plan.trialDays > 0 ? `Start ${plan.trialDays}-day trial` : "Get started"}
      </Link>
    </div>
  );
}

export function PricingPage({
  plans,
  customTrialDays,
}: {
  plans: PlanDTO[];
  /** The custom plan's trial, set in /admin/plans. */
  customTrialDays: number;
}) {
  // A $0 tier is what happens when somebody skips, not something to sell here.
  const sellable = plans.filter((p) => !p.isFree);
  const customTop = CUSTOM_BASE_CENTS + CUSTOM_PAGES.length * CUSTOM_PAGE_CENTS;

  return (
    <div className="jf-lp min-h-full bg-white">
      <Nav />
      <main>
        {/* Masthead. The rule under it is the page's spine — the same hairline
            the plates and the ledger rows are drawn with. */}
        <section className="px-5 sm:px-6">
          <div className="mx-auto lp-wrap py-[9vmin]">
            <Reveal>
              <p className="lp-eyebrow text-lp-blue">Pricing</p>
              <h1 className="mt-6 max-w-[22ch] text-[clamp(38px,5.4vw,72px)] font-bold leading-[1.04] tracking-[-0.03em]">
                Pay for the shop you run.
              </h1>
              <p className="mt-6 max-w-[52ch] text-[16px] leading-[1.65] text-slate-500 sm:text-[17px]">
                Every plan carries unlimited clients and the client portal. Move up, move down, or
                build your own from the pages you actually open. No setup fee, cancel whenever.
              </p>
            </Reveal>
          </div>
        </section>

        {/* The plates */}
        <section className="px-5 sm:px-6">
          <div className="mx-auto lp-wrap">
            <div className="border-t border-slate-900/10 pt-[6vmin]">
              <Reveal>
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {sellable.map((p, i) => (
                    <Plate key={p.slug} plan={p} index={i} />
                  ))}
                </div>
              </Reveal>

              {sellable.length === 0 ? (
                <p className="py-12 text-center text-[15px] text-slate-500">
                  Plans are being updated. Check back shortly.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        {/* Build your own — the page that prices itself */}
        <section className="px-5 sm:px-6">
          <div className="mx-auto lp-wrap py-[8vmin]">
            <Reveal>
              <div className="pr-custom p-7 sm:p-10">
                <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <p className="lp-eyebrow text-lp-blue">Build your plan</p>
                    <h2 className="mt-5 text-[clamp(26px,3vw,40px)] font-bold leading-[1.12] tracking-[-0.02em]">
                      Start at {price(CUSTOM_BASE_CENTS)}. Add only the machines you use.
                    </h2>
                    <p className="mt-4 max-w-[56ch] text-[15px] leading-[1.65] text-slate-500">
                      The everyday workspace is included — dashboard, proposals with the manual
                      builder, clients, projects, CRM, jobs, messages and financials. Each page
                      below is {price(CUSTOM_PAGE_CENTS)} a month on top, and you can drop one the
                      month you stop using it.
                    </p>

                    <div className="mt-7 flex flex-wrap gap-2">
                      {CUSTOM_PAGES.map((p) => (
                        <span key={p.id} className="pr-page">
                          {p.label}
                          <b>+{price(CUSTOM_PAGE_CENTS)}</b>
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-col justify-between border-slate-900/10 lg:border-l lg:pl-10">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="pr-amt">{price(CUSTOM_BASE_CENTS)}</span>
                        <span className="pr-per">/ month base</span>
                      </div>
                      <div className="mt-2.5">
                        {customTrialDays > 0 ? (
                          <span className="pr-trial">{customTrialDays}-day free trial</span>
                        ) : null}
                      </div>
                      <p className="pr-desc mt-5">
                        A full build with all {CUSTOM_PAGES.length} pages comes to{" "}
                        {price(customTop)} a month — still less than the seats most shops pay for
                        twice over.
                      </p>
                    </div>
                    <Link href={REGISTER as never} className="pr-cta mt-8">
                      {customTrialDays > 0 ? `Start ${customTrialDays}-day trial` : "Build your plan"}
                    </Link>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <CtaFooter />
      </main>
    </div>
  );
}
