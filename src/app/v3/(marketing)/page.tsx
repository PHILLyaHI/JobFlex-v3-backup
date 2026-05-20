import type { Metadata } from "next";
import { Hero } from "@/components/v3/landing/Hero";
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
    </main>
  );
}
