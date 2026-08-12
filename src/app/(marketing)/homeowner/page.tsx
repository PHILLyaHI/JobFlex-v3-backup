// /homeowner — the public homeowner intake page.
//
// A verbatim port of the approved mockup `jobflex-homeowner (13).html`. The
// page body is a client component (the wizard, the vignettes, the count-up and
// the parallax all need the browser); this file stays a server component so the
// donor's <title> and <meta name="description"> ship as real route metadata.
//
// CONVENTION (2026-08-11): a re-port REPLACES its predecessor in place — same
// route path, same component files, never a parallel `-blueprint` route beside
// the old one. This reverses the earlier side-by-side rule still recorded in
// headers like src/app/dashboard/subscription-blueprint/page.tsx and
// src/app/(auth)/auth/login/page.tsx ("a donor surface is never overwritten by
// its successor"); those are other agents' files and are left alone.
//
// ROUTE PLACEMENT IS SETTLED (owner decision). This donor targets the MARKETING
// landing: `(marketing)/homeowner` + `src/components/v3/homeowner-landing/`.
// It is NOT the logged-in homeowner portal — that is a different surface at
// `(portal)/homeowner-portal`, ported from a different donor
// (`jobflex-homeowner-blueprint (14).html`) into
// `src/components/v3/homeowner-blueprint/`. Neither was touched here.
//
// CHROME: this is a standalone marketing page carrying the donor's own <nav>
// and <footer>. There is no src/app/(marketing)/layout.tsx, so nothing wraps it
// but the root layout — nothing is doubled. It is deliberately NOT mounted
// inside blueprint-shell.
//
// No server actions, no API routes, no Prisma. Every figure on the page is
// static fixture copy, and the wizard's attachments and contact fields never
// leave the browser — the donor's wizard has no submit target and none was
// invented (see the port report for the api/homeowner-request mismatch).

import type { Metadata } from "next";
import { HomeownerContent } from "@/components/v3/homeowner-landing/homeowner-content";

export const metadata: Metadata = {
  title: "JobFlex Homeowner Portal — Describe your project, get real quotes",
  description:
    "Describe your project in plain English. JobFlex turns it into a contractor-ready scope and verified local pros send line-item quotes — free, no account required.",
};

export default function HomeownerLandingPage() {
  return <HomeownerContent />;
}
