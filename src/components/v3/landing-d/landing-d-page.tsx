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

import { BuiltSection } from "./built-section";
import { CtaFooter } from "./cta-footer";
import { EstimatorsShowcase } from "./estimators-showcase";
import { FlowFeatures } from "./flow-features";
import { Hero } from "./hero";
import { Integrations } from "./integrations";
import { Intro } from "./intro";
import { JobsSection } from "./jobs-section";
import { LandingVariantEffects } from "./landing-variant-effects";
import {
  isVariantReady,
  signupHref,
  variantContent,
  type LandingVariantKey,
  type UtmParams,
} from "./landing-variants";
import { MobileCta } from "./mobile-cta";
import { Montage } from "./montage";
import { Nav } from "./nav";
import { PortalSection } from "./portal-section";
import { ProposalsSection } from "./proposals-section";
import { REGISTER } from "./routes";
import { ScrollFx } from "./scroll-fx";
import { StatsSection } from "./stats-section";
import "./landing-d.css";

export interface LandingDProps {
  /** Resolved trade variant; undefined is the default page. */
  variant?: LandingVariantKey;
  /** True when the variant came from the URL rather than the memory cookie. */
  explicitVariant?: boolean;
  /** utm_* the visit arrived with — carried into the register links. */
  utm?: UtmParams;
}

export function LandingD({ variant, explicitVariant = false, utm = {} }: LandingDProps) {
  const v = variantContent(variant);
  const register = signupHref(REGISTER, { industry: variant, utm });
  return (
    <div className="jf-lp min-h-full bg-white">
      <Nav registerHref={register} />
      <main>
        <Hero variant={v} registerHref={register} />
        <Intro registerHref={register} />
        <EstimatorsShowcase initialSlide={variant && isVariantReady(variant) ? v.showcaseSlide : undefined} />
        <Montage />
        <ProposalsSection />
        <PortalSection />
        <JobsSection />
        <FlowFeatures />
        <Integrations registerHref={register} />
        <StatsSection />
        <BuiltSection />
        <CtaFooter registerHref={register} />
      </main>
      <MobileCta registerHref={register} />
      <ScrollFx />
      <LandingVariantEffects industry={variant} remember={explicitVariant} utm={utm} />
    </div>
  );
}
