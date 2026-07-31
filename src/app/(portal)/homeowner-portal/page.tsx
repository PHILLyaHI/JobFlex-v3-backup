// Homeowner Portal — Blueprint edition. Pixel-identical port of the donor
// `jobflex-homeowner-blueprint (14).html`.
//
// Public route: the donor is a marketing/intake surface with no auth of its
// own, so this page renders without a session check, like every other
// (portal) entry point.
//
// The existing /homeowners route is untouched — it still serves the classic
// lead-capture form wired to the homeowner server actions.

import type { Metadata } from "next";
import { HomeownerContent } from "@/components/v3/homeowner-blueprint/homeowner-content";

// Title and description are the donor's <head> verbatim.
export const metadata: Metadata = {
  title: "JobFlex Homeowner Portal — Describe your project, get real quotes",
  description:
    "Describe your project in plain English. JobFlex turns it into a contractor-ready scope and verified local pros send line-item quotes — free, no account required.",
};

export default function HomeownerPortalPage() {
  return <HomeownerContent />;
}
