/* LANDING-E — THE landing, mounted at `/` (owner, 2026-09-16). It began as
   the test copy of landing-d (2026-09-10) and won: honest trial copy, the
   three-field register, the first-estimate card, the welcome email, Google
   One Tap, the neutral ink palette and the phone pass. landing-d is gone;
   the trade data (landing-variants, landing-groups, smart-scenarios) lives
   here now. Its events still carry `variant: "e"` so the admin's d-vs-e
   history reads on. */
/* The landing itself, as one component; the CSS import lives here so any
   entry point pulls it in by rendering this.

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
import { WarmLayout } from "./warm-layout";
import { Hero } from "./hero";
import { Intro } from "./intro";
import { LOW_CTA, firstPersonCta } from "./cta-copy";
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
import { GoogleOneTap } from "@/components/auth/google-one-tap";
import { Nav } from "./nav";
import { REGISTER } from "./routes";
import "./landing-e.css";

export interface LandingEProps {
  /** Resolved trade variant; undefined is the default page. */
  variant?: LandingVariantKey;
  /** True when the variant came from the URL rather than the memory cookie. */
  explicitVariant?: boolean;
  /** utm_* the visit arrived with — carried into the register links. */
  utm?: UtmParams;
}

export async function LandingE({ variant, explicitVariant = false, utm = {} }: LandingEProps) {
  const v = variantContent(variant);
  // Every register link carries the trade and the visit's utm_*.
  const register = signupHref(REGISTER, { industry: variant, utm });
  // The price anchor shows the Subscription page's own catalogue (CRO stage
  // 2); a catalogue read that fails leaves the section out rather than the
  // page down.
  const plans = await getPlanCatalog().catch(() => []);
  // The trade group's data for the sections under the hero (CRO stage 3):
  // undefined for the default page and the interior trades, which keep the
  // sections' own built-in kitchen.
  const g = groupContentFor(variant);
  // CTA copy (pass B): first person with the trade's outcome at the top of
  // the page, "Start my free trial" from Proposals down.
  const top = firstPersonCta(variant);
  const low = LOW_CTA;
  // The showcase's Smart slide plays the trade's own job: the variant's
  // scenario, or the roofing / fencing scenarios written for the pages whose
  // hero is the roof or fence shot (smart-scenarios.ts).
  const smart = v.scenario ?? (variant === "roofing" || variant === "fencing" ? variant : undefined);
  // Below the intro every section is wrapped in `.lp-cv` plus its own name,
  // which is what the stylesheet hangs that section's intrinsic height on
  // (landing-e.css, `--lp-cv`) — a shared guess made the page grow ~2,800px
  // under the reader as they scrolled.
  // Below the intro every section is wrapped in `.lp-cv`
  // (content-visibility: auto): the browser skips its style and layout until
  // it is near the viewport — the mobile LCP's render delay was style/layout
  // of the whole page.
  return (
    <div className="jf-lp min-h-full bg-white">
      <Nav registerHref={register} cta={top} />
      <main>
        <Hero variant={v} variantKey={variant} utm={utm} registerHref={register} cta={top} />
        <Intro />
        <div className="lp-cv lp-cv--showcase"><EstimatorsShowcase ownSlide={variant && isVariantReady(variant) ? v.showcaseSlide : undefined} scenario={smart} registerHref={register} cta={top} /></div>
        {(g?.montage ?? true) && <div className="lp-cv lp-cv--montage"><Montage /></div>}
        <div className="lp-cv lp-cv--proposals"><ProposalsSection proposal={g?.proposal} registerHref={register} cta={low} /></div>
        <div className="lp-cv lp-cv--portal"><PortalSection portal={g?.portal} /></div>
        {/* One content-visibility box for the two sections the guide line runs
            through, so both are laid out together and the line can be measured. */}
        <div className="lp-cv lp-cv--crew">
          <CrewGuide>
            <JobsSection crew={g?.crew} phoneLanes={g?.phoneLanes} />
            <FlowFeatures />
          </CrewGuide>
        </div>
        <div className="lp-cv lp-cv--integrations"><Integrations /></div>
        <div className="lp-cv lp-cv--stats"><StatsSection rows={g?.stats} /></div>
        <div className="lp-cv lp-cv--built"><BuiltSection jobs={g?.jobs} phoneJobs={g?.phoneJobs} /></div>
        <div className="lp-cv lp-cv--pricing"><LandingPricing plans={plans} registerHref={register} cta={low} /></div>
        <div className="lp-cv lp-cv--faq"><LandingFaq variant={variant} registerHref={register} cta={low} /></div>
        <CtaFooter registerHref={register} cta={low} />
      </main>
      <MobileCta registerHref={register} cta={top} />
      <ScrollFx />
      <LazyBg />
      <WarmLayout />
      <CtaTracker industry={variant} />
      <LandingVariantEffects industry={variant} remember={explicitVariant} utm={utm} />
      {/* Google One Tap (pass A): only when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set;
          loads after the page is idle, so it never competes with the hero. */}
      <GoogleOneTap />
    </div>
  );
}
