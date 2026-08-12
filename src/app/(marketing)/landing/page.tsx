// JobFlex marketing landing — PORT of the approved mockup
// `jobflex-landing (21).html` (route: /landing).
//
// CONVENTION (2026-08-11): a re-port REPLACES its predecessor in place — same
// route path, same component files. It does NOT fork a parallel `-blueprint`
// route beside the old one. This reverses the earlier side-by-side rule that
// this header used to assert (and that headers like
// src/app/dashboard/subscription-blueprint/ still record); /landing and
// src/components/v3/landing/* are overwritten, never duplicated.
//
// Scope note: that reversal governs ports of THIS donor. src/app/page.tsx is a
// different, hand-written surface (it has the signed-in redirect), not a
// previous port of `jobflex-landing (21).html`, so it is left alone here.
// Promoting /landing to `/` remains the owner's call.
//
// This page carries the donor's OWN chrome — its sticky nav and its footer are
// part of the mockup. There is no src/app/(marketing)/layout.tsx, so nothing
// wraps it but the root layout; no nav or footer is doubled.
//
// Public route, no auth, no data layer: every figure on the page is static
// copy from the mockup. Server component; all behavior is in the client
// component it renders.
//
// Metadata is the donor's <title> and <meta name="description">, verbatim.

import type { Metadata } from "next";
import { LandingContent } from "@/components/v3/landing/landing-content";

export const metadata: Metadata = {
  title: "JobFlex — Quote. Schedule. Get paid.",
  description:
    "The operating system for contractors — smart proposals, a clear lead pipeline, scheduling, client portals, and payments in one workspace.",
};

export default function LandingPage() {
  return <LandingContent />;
}
