// LANDING-D — the standalone marketing landing, ported into the app.
//
// The sections are the donor's, moved under components/v3/landing-d with their
// Tailwind v4 palette rewritten onto the `lp-*` names in tailwind.config.ts
// (the donor's bare `ink` / `paper` / `base` collide with the blueprint tokens,
// and `text-base` is a font size in our config). Everything visual that is not
// a utility lives in landing-d.css, scoped `.jf-lp`.
//
// It sits alongside /landing-a../landing-c rather than replacing `/`, which
// still serves the blueprint landing.

import type { Metadata } from "next";

import { BuiltSection } from "@/components/v3/landing-d/built-section";
import { CtaFooter } from "@/components/v3/landing-d/cta-footer";
import { EstimatorSection } from "@/components/v3/landing-d/estimator-section";
import { FlowFeatures } from "@/components/v3/landing-d/flow-features";
import { Hero } from "@/components/v3/landing-d/hero";
import { Integrations } from "@/components/v3/landing-d/integrations";
import { Intro } from "@/components/v3/landing-d/intro";
import { JobsSection } from "@/components/v3/landing-d/jobs-section";
import { MobileCta } from "@/components/v3/landing-d/mobile-cta";
import { Montage } from "@/components/v3/landing-d/montage";
import { Nav } from "@/components/v3/landing-d/nav";
import { PortalSection } from "@/components/v3/landing-d/portal-section";
import { ProposalsSection } from "@/components/v3/landing-d/proposals-section";
import { ScrollFx } from "@/components/v3/landing-d/scroll-fx";
import { StatsSection } from "@/components/v3/landing-d/stats-section";
import "@/components/v3/landing-d/landing-d.css";

export const metadata: Metadata = {
  title: "JobFlex — Turn your trade into a business",
  description:
    "JobFlex is the operating system for small-shop contractors: estimating, proposals, scheduling, jobs, and invoicing in one workspace.",
};

export default function LandingDPage() {
  return (
    <div className="jf-lp min-h-full bg-white">
      <Nav />
      <main>
        <Hero />
        <Intro />
        <EstimatorSection />
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
