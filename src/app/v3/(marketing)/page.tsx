import type { Metadata } from "next";
import { BuildingBlocks01 } from "@/components/v3/landing/BuildingBlocks01";
import { ContractorOwnedOps03 } from "@/components/v3/landing/ContractorOwnedOps03";
import { CustomersStrip } from "@/components/v3/landing/CustomersStrip";
import { FAQ } from "@/components/v3/landing/FAQ";
import { FinalCTA } from "@/components/v3/landing/FinalCTA";
import { Footer } from "@/components/v3/landing/Footer";
import { GTMFeatures } from "@/components/v3/landing/GTMFeatures";
import { Hero } from "@/components/v3/landing/Hero";
import { ProblemSection } from "@/components/v3/landing/ProblemSection";
import { SolutionIntro } from "@/components/v3/landing/SolutionIntro";
import { Testimonials } from "@/components/v3/landing/Testimonials";
import { TrustedByStrip } from "@/components/v3/landing/TrustedByStrip";
import "./_styles/landing.css";

export const metadata: Metadata = {
  title:
    "JobFlex — Run your contracting business like a well-kept shop",
  description:
    "The quiet operating system that turns scattered leads, paper estimates, and Tuesday-night invoicing into one clear pipeline. Built for the way crews actually work.",
};

export default function V3Landing() {
  return (
    <main className="min-h-screen bg-[color:var(--paper)] text-[color:var(--ink)]">
      <Hero />
      <TrustedByStrip />
      <ProblemSection />
      <SolutionIntro />
      <BuildingBlocks01 />
      <ContractorOwnedOps03 />
      <GTMFeatures />
      <CustomersStrip />
      <Testimonials />
      <FinalCTA />
      <FAQ />
      <Footer />
    </main>
  );
}
