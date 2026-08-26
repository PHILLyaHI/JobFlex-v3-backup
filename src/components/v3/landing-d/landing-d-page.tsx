/* The landing itself, as one component, so `/` and `/landing-d` mount the SAME
   build rather than two copies of the same section list. The CSS import lives
   here for the same reason — either entry point pulls it in by rendering this.

   Section order is the argument the page makes: what it is (hero, intro), what
   it does (estimators, the wall of real work), then the four surfaces a shop
   lives in (proposals, portal, jobs, money), then proof and the close. */

import { BuiltSection } from "./built-section";
import { CtaFooter } from "./cta-footer";
import { EstimatorsShowcase } from "./estimators-showcase";
import { FlowFeatures } from "./flow-features";
import { Hero } from "./hero";
import { Integrations } from "./integrations";
import { Intro } from "./intro";
import { JobsSection } from "./jobs-section";
import { MobileCta } from "./mobile-cta";
import { Montage } from "./montage";
import { Nav } from "./nav";
import { PortalSection } from "./portal-section";
import { ProposalsSection } from "./proposals-section";
import { ScrollFx } from "./scroll-fx";
import { StatsSection } from "./stats-section";
import "./landing-d.css";

export function LandingD() {
  return (
    <div className="jf-lp min-h-full bg-white">
      <Nav />
      <main>
        <Hero />
        <Intro />
        <EstimatorsShowcase />
        <Montage />
        <ProposalsSection />
        <PortalSection />
        <JobsSection />
        <FlowFeatures />
        <Integrations />
        <StatsSection />
        <BuiltSection />
        <CtaFooter />
      </main>
      <MobileCta />
      <ScrollFx />
    </div>
  );
}
