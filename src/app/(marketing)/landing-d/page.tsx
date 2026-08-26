// LANDING-D — the standalone marketing landing, ported into the app.
//
// The sections are the donor's, moved under components/v3/landing-d with their
// Tailwind v4 palette rewritten onto the `lp-*` names in tailwind.config.ts
// (the donor's bare `ink` / `paper` / `base` collide with the blueprint tokens,
// and `text-base` is a font size in our config). Everything visual that is not
// a utility lives in landing-d.css, scoped `.jf-lp`.
//
// As of 2026-08-25 this design IS the root landing: `/` renders the same
// <LandingD /> this route does, so the two URLs cannot drift. The route stays
// up under its own name for review and for linking to it directly.

import type { Metadata } from "next";

import { LandingD } from "@/components/v3/landing-d/landing-d-page";

export const metadata: Metadata = {
  title: "JobFlex — Turn your trade into a business",
  description:
    "JobFlex is the operating system for small-shop contractors: estimating, proposals, scheduling, jobs, and invoicing in one workspace.",
};

export default function LandingDPage() {
  return <LandingD />;
}
