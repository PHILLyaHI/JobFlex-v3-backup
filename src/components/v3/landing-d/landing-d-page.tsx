/* The landing itself, as one component, so `/` and `/landing-d` mount the SAME
   build rather than two copies of the same section list. The CSS import lives
   here for the same reason — either entry point pulls it in by rendering this.

   Section order is the argument the page makes: what it is (hero, intro), what
   it does (estimators, the wall of real work), then the four surfaces a shop
   lives in (proposals, portal, jobs, money), then proof and the close.

   TRADE VARIANTS (2026-09-06). An ad link carrying `?industry=fencing` swaps
   the hero and the showcase's opening slide; every register link on the page
   then carries the industry (and the visit's utm_*) into /auth/register. The
   variant is resolved by the entry point on the server and handed down as
   props — nothing in this tree reads the URL — so the first paint is already
   the right one. With no variant every prop below is its default and the
   page renders exactly as it did before. */

import dynamic from "next/dynamic";
import { getPlanCatalog } from "@/lib/planCatalogServer";
import { CrewGuide } from "./crew-guide";
import { CtaFooter } from "./cta-footer";
import { LandingFaq } from "./landing-faq";
import { groupContentFor } from "./landing-groups";
import { LandingPricing } from "./landing-pricing";
import { CtaTracker } from "./cta-tracker";
import { LazyBg } from "./lazy-bg";
import { Hero } from "./hero";
import { Intro } from "./intro";
import { LandingVariantEffects } from "./landing-variant-effects";

/* CRO stage 1 (2026-09-09): everything under the intro is code-split. The
   sections still render on the server (the HTML is byte-for-byte what it
   was), but their JavaScript — the estimator sequences, the GSAP scroll
   effects, the integrations field, the proposal and portal mock-ups — no
   longer sits on the main thread before the hero has painted: Lighthouse
   put 2–4 s of the mobile LCP in render delay from script work alone. */
const EstimatorsShowcase = dynamic(() => import("./estimators-showcase").then((m) => m.EstimatorsShowcase));
const Montage = dynamic(() => import("./montage").then((m) => m.Montage));
const ProposalsSection = dynamic(() => import("./proposals-section").then((m) => m.ProposalsSection));
const PortalSection = dynamic(() => import("./portal-section").then((m) => m.PortalSection));
const JobsSection = dynamic(() => import("./jobs-section").then((m) => m.JobsSection));
const FlowFeatures = dynamic(() => import("./flow-features").then((m) => m.FlowFeatures));
const Integrations = dynamic(() => import("./integrations").then((m) => m.Integrations));
const StatsSection = dynamic(() => import("./stats-section").then((m) => m.StatsSection));
const BuiltSection = dynamic(() => import("./built-section").then((m) => m.BuiltSection));
const ScrollFx = dynamic(() => import("./scroll-fx").then((m) => m.ScrollFx));
import {
  isVariantReady,
  signupHref,
  variantContent,
  type LandingVariantKey,
  type UtmParams,
} from "./landing-variants";
import { MobileCta } from "./mobile-cta";
import { Nav } from "./nav";
import { REGISTER } from "./routes";
import "./landing-d.css";

export interface LandingDProps {
  /** Resolved trade variant; undefined is the default page. */
  variant?: LandingVariantKey;
  /** True when the variant came from the URL rather than the memory cookie. */
  explicitVariant?: boolean;
  /** utm_* the visit arrived with — carried into the register links. */
  utm?: UtmParams;
}

export async function LandingD({ variant, explicitVariant = false, utm = {} }: LandingDProps) {
  const v = variantContent(variant);
  const register = signupHref(REGISTER, { industry: variant, utm });
  // The price anchor shows the Subscription page's own catalogue (CRO stage
  // 2); a catalogue read that fails leaves the section out rather than the
  // page down.
  const plans = await getPlanCatalog().catch(() => []);
  // The trade group's data for the sections under the hero (CRO stage 3):
  // undefined for the default page and the interior trades, which keep the
  // sections' own built-in kitchen.
  const g = groupContentFor(variant);
  // Below the intro every section is wrapped in `.lp-cv`
  // (content-visibility: auto): the browser skips its style and layout until
  // it is near the viewport — the mobile LCP's render delay was style/layout
  // of the whole page.
  return (
    <div className="jf-lp min-h-full bg-white">
      <Nav registerHref={register} cta={variant ? v.primaryCta : undefined} />
      <main>
        <Hero variant={v} variantKey={variant} utm={utm} registerHref={register} />
        <Intro registerHref={register} />
        <div className="lp-cv"><EstimatorsShowcase initialSlide={variant && isVariantReady(variant) ? v.showcaseSlide : undefined} /></div>
        {(g?.montage ?? true) && <div className="lp-cv"><Montage /></div>}
        <div className="lp-cv"><ProposalsSection proposal={g?.proposal} /></div>
        <div className="lp-cv"><PortalSection portal={g?.portal} /></div>
        {/* One content-visibility box for the two sections the guide line runs
            through, so both are laid out together and the line can be measured. */}
        <div className="lp-cv">
          <CrewGuide>
            <JobsSection crew={g?.crew} phoneLanes={g?.phoneLanes} />
            <FlowFeatures />
          </CrewGuide>
        </div>
        <div className="lp-cv"><Integrations registerHref={register} /></div>
        <div className="lp-cv"><StatsSection rows={g?.stats} /></div>
        <div className="lp-cv"><BuiltSection jobs={g?.jobs} phoneJobs={g?.phoneJobs} /></div>
        <div className="lp-cv"><LandingPricing plans={plans} registerHref={register} cta={variant ? v.primaryCta : undefined} /></div>
        <div className="lp-cv"><LandingFaq variant={variant} /></div>
        <CtaFooter registerHref={register} cta={variant ? v.primaryCta : undefined} />
      </main>
      <MobileCta registerHref={register} cta={variant ? v.primaryCta : undefined} />
      <ScrollFx />
      <LazyBg />
      <CtaTracker industry={variant} />
      <LandingVariantEffects industry={variant} remember={explicitVariant} utm={utm} />
    </div>
  );
}
