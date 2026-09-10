import { expandPlanFeatures, formatPlanPrice, priceCadence, type PlanDTO } from "@/lib/planCatalog";
import { CtaNote } from "./cta-note";
import { Reveal } from "./reveal";
import { REGISTER } from "./routes";

/* The price anchor before the footer (CRO stage 2, 2026-09-09). The plans
   are the Subscription page's own catalogue (PricingPlan, via
   getPlanCatalog on the server) — nothing here names a plan or a price.
   Drawn as the landing's blueprint table: hard 1.5 px ink borders, mono-caps
   column heads, hairline rows, one lime CTA. A $0 tier, when one exists in
   the catalogue, is what a skipped checkout leaves behind and is not sold. */
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
    <section className="relative overflow-hidden bg-white px-5 py-[8vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-eyebrow text-slate-500">Pricing</h2>
          <p className="mt-6 max-w-[44rem] text-[clamp(26px,2.8vw,40px)] font-bold leading-[1.2] tracking-[-0.015em] text-lp-ink">
            Flat monthly price · no per-seat add-ons
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10">
          {/* Column heads — the table's spine */}
          <div
            className="hidden border-b-[1.5px] border-lp-ink pb-2 font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-slate-400 md:grid"
            style={{ gridTemplateColumns: `minmax(0,1.4fr) repeat(${sellable.length}, minmax(0,1fr))` }}
          >
            <span>Plan</span>
            {sellable.map((p) => (
              <span key={p.slug} className="px-4">
                {String(p.order).padStart(2, "0")} · {p.name}
              </span>
            ))}
          </div>

          {/* Plates: on a phone one under the other, on a desk three across */}
          <div className="grid grid-cols-1 gap-4 md:mt-5 md:grid-cols-3 md:gap-5">
            {sellable.map((p) => {
              const has = included.get(p.slug) ?? new Set<string>();
              return (
                <article
                  key={p.slug}
                  className={`rounded-[2px] border-[1.5px] bg-white p-5 sm:p-6 ${
                    p.highlight ? "border-lp-ink shadow-card" : "border-black/15"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="text-[18px] font-bold tracking-[-0.01em] text-lp-ink">{p.name}</h3>
                    {p.highlight && (
                      <span className="rounded-[2px] border-[1.5px] border-lp-ink px-2 py-[3px] font-mono text-[8.5px] font-bold uppercase tracking-[0.14em] text-lp-ink">
                        Most popular
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-[clamp(34px,3.4vw,44px)] font-bold leading-none tracking-[-0.02em] text-lp-ink">
                      {formatPlanPrice(p.priceCents)}
                    </span>
                    <span className="font-mono text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">
                      {priceCadence(true)}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-3 text-[13.5px] leading-[1.5] text-slate-500">{p.description}</p>
                  )}
                  <ul className="mt-5 border-t-[1.5px] border-lp-ink">
                    {rows.map((row) => {
                      const on = has.has(row.toLowerCase());
                      return (
                        <li
                          key={row}
                          className={`flex items-start gap-3 border-b border-black/10 py-2 text-[13px] leading-[1.4] ${
                            on ? "text-lp-ink" : "text-slate-300"
                          }`}
                        >
                          <span className="w-3 shrink-0 font-mono text-[11px] font-bold" aria-hidden>
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
            <CtaNote />
            {trial > 0 && (
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {trial}-day trial on every plan · cancel anytime
              </span>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
