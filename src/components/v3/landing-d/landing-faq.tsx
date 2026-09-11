import type { LandingVariantKey } from "./landing-variants";
import { Reveal } from "./reveal";

/* Six questions as a spec sheet (CRO stage 2, 2026-09-09): mono numbers
   01–06 on hairline rows, the same lettering as the proposal table. The
   fourth row is the trade's: the roofing and fencing heroes promise a
   measurement, so they get "where do the figures come from" (aerial data,
   never a provider's name); every other trade gets how a description is
   priced. Static markup, no state. Type floors (2026-09-10): the numbers
   11 px mono caps, the answers 15 px, slate-600 so both clear 4.5:1 on the
   paper ground (slate-500 on paper is 4.47). */
type Faq = { q: string; a: string };

const DATA_Q: Record<"roofing" | "fencing" | "other", Faq> = {
  roofing: {
    q: "Where do the roof figures come from?",
    a: "From aerial data for the address: area, pitch and each structure are measured from above, and the report says which figures were measured and which were reported.",
  },
  fencing: {
    q: "Where do the fence figures come from?",
    a: "The lot lines come from the parcel record and the grade from terrain data; the run is the line you draw on the map, and the takeoff follows it.",
  },
  other: {
    q: "How is an estimate priced from a description?",
    a: "You type the job the way you would say it to a foreman; the estimator turns it into line items with your trade's units and current material and labor prices, and you adjust anything before it goes out.",
  },
};

function questions(variant: LandingVariantKey | undefined): Faq[] {
  const data = variant === "roofing" || variant === "fencing" ? DATA_Q[variant] : DATA_Q.other;
  return [
    {
      q: "Do I need a credit card to start?",
      a: "No. The 14-day trial starts without one; you add a card only when you pick a plan.",
    },
    {
      q: "How long does it take to learn?",
      a: "Most shops send their first proposal the same day. Type the job, the estimate writes itself, and the calendar and invoices follow from it.",
    },
    {
      q: "My trade isn't in the list.",
      a: "Pick the closest one and name yours under Other. Templates, units and lead matching follow the trade you type.",
    },
    data,
    {
      q: "What happens after 14 days?",
      a: "Pick a plan or don't. Nothing is charged until you do, and everything you made stays in the account.",
    },
    {
      q: "Does it work from my phone?",
      a: "Yes. The whole app runs in the phone's browser, crews included; there is nothing to install.",
    },
  ];
}

export function LandingFaq({ variant }: { variant?: LandingVariantKey }) {
  const items = questions(variant);
  return (
    <section className="relative overflow-hidden bg-lp-paper px-5 py-[8vmin] sm:px-6">
      <div className="mx-auto lp-wrap">
        <Reveal>
          <h2 className="lp-eyebrow text-slate-600">Questions</h2>
          <p className="mt-6 max-w-[44rem] text-[clamp(26px,2.8vw,40px)] font-bold leading-[1.2] tracking-[-0.015em] text-lp-ink">
            The six things every shop asks first.
          </p>
        </Reveal>
        <Reveal delay={120} className="mt-10">
          <dl className="border-t-[1.5px] border-lp-ink">
            {items.map((item, i) => (
              <div
                key={item.q}
                className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-4 border-b border-black/10 py-5 md:grid-cols-[64px_minmax(0,22rem)_minmax(0,1fr)] md:gap-x-8"
              >
                <span className="pt-[3px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 lg:text-[12px]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <dt className="text-[16px] font-bold leading-[1.35] tracking-[-0.01em] text-lp-ink sm:text-[17px]">{item.q}</dt>
                <dd className="col-start-2 mt-2 text-[15px] leading-[1.6] text-slate-600 md:col-start-3 md:mt-0">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
