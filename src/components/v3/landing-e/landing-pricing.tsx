import { expandPlanFeatures, formatPlanPrice, priceCadence, type PlanDTO } from "@/lib/planCatalog";
import { Reveal } from "./reveal";
import { REGISTER } from "./routes";

/* The price anchor before the footer (CRO stage 2, 2026-09-09). The plans
   are the Subscription page's own catalogue (PricingPlan, via
   getPlanCatalog on the server) — nothing here names a plan or a price.
   THE INK SHEET (owner, 2026-09-10): lp-base under the showcase's drafting
   grid, white copy, paper plates with a 1 px ink line and a hard offset
   shadow (landing-e.css, .lp-price). Mono-caps column heads, hairline rows,
   one lime CTA. A $0 tier, when one exists in
   the catalogue, is what a skipped checkout leaves behind and is not sold.
   Type floors (2026-09-10): mono caps 11 px, text 14 px, 15 px on a phone;
   every ink at 4.5:1 or better on white. */
export function LandingPricing({
  plans,
  registerHref = REGISTER,
  cta = "Start 14-Day Free Trial",
}: {
  plans: PlanDTO[];
  registerHref?: string;
  cta?: string;
}) {
  const sellable = plans.filter((p) => !p.isFree);
  if (!sellable.length) return null;
  const { rows, included } = expandPlanFeatures(sellable);
  const trial = Math.max(0, ...sellable.map((p) => p.trialDays));

  return (
    <section id="pricing" className="lp-price relative overflow-hidden px-5 py-[8vmin] sm:px-6">
      <div className="relative z-[1] mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-eyebrow text-white">Pricing</h2>
          {/* U+2011 non-breaking hyphens: the line never breaks at "per-/seat" or "add-/ons". */}
          <p className="mt-6 max-w-[44rem] text-[clamp(26px,2.8vw,40px)] font-bold leading-[1.2] tracking-[-0.015em] text-white">
            Flat monthly price · no per‑seat add‑ons
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10">
          {/* The table's spine: the rule alone, no column heads (owner,
              2026-09-10). The box keeps the head row's 25.5 px so the title,
              the rule and the plates sit exactly where they did. */}
          <div className="hidden h-[25.5px] border-b-[1.5px] border-white/60 md:block" aria-hidden />

          {/* Plates: on a phone one under the other, on a desk three across */}
          <div className="grid grid-cols-1 gap-4 md:mt-5 md:grid-cols-3 md:gap-5">
            {sellable.map((p) => {
              const has = included.get(p.slug) ?? new Set<string>();
              return (
                <article
                  key={p.slug}
                  className={`lp-price-plate rounded-[2px] p-5 sm:p-6 ${p.highlight ? "is-hot" : ""}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[18px] font-bold tracking-[-0.01em] text-ink">{p.name}</h3>
                    {p.highlight && (
                      <span className="rounded-[2px] border-[1.5px] border-lp-ink px-2 py-[3px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ink lg:text-[12px]">
                        Most popular
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[clamp(34px,3.4vw,44px)] font-bold leading-none tracking-[-0.02em] text-ink">
                      {formatPlanPrice(p.priceCents)}
                    </span>
                    <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[#555555] lg:text-[12px]">
                      {priceCadence(true)}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-3 text-[15px] leading-[1.5] text-[#555555] sm:text-[14px]">{p.description}</p>
                  )}
                  <ul className="mt-5 border-t-[1.5px] border-lp-ink">
                    {rows.map((row) => {
                      const on = has.has(row.toLowerCase());
                      return (
                        <li
                          key={row}
                          className={`flex items-start gap-3 border-b border-black/10 py-2 text-[15px] leading-[1.4] sm:text-[14px] ${
                            on ? "text-ink" : "text-[#555555]"
                          }`}
                        >
                          <span className="w-4 shrink-0 font-mono text-[15px] font-bold sm:text-[14px]" aria-hidden>
                            {on ? "✓" : "—"}
                          </span>
                          <span>{row}</span>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={180} className="mt-9">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
            <a href={registerHref} className="lp-btn-lime w-full sm:w-auto" data-cta="pricing">
              {cta}
              <span aria-hidden>→</span>
            </a>
            {/* One line under the button (owner, stage 2): the trial on every plan. */}
            {trial > 0 && (
              <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white/80 lg:text-[13px]">
                {trial}-day trial on every plan · cancel anytime
              </span>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
