// JobFlex marketing landing — PORT of the approved mockup
// `jobflex-landing (21).html` (route: /landing).
//
// The live landing at src/app/page.tsx is deliberately NOT replaced. Standing
// repo convention: a donor surface and its successor live side by side until
// the owner picks one — same reasoning as the header of
// src/app/dashboard/manual-blueprint/page.tsx. Promoting this to `/` is the
// owner's call, not this port's.
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
