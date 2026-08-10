// /homeowner — the public homeowner intake page.
//
// A verbatim port of the approved mockup `jobflex-homeowner (13).html`. The
// page body is a client component (the wizard, the vignettes, the count-up and
// the parallax all need the browser); this file stays a server component so the
// donor's <title> and <meta name="description"> ship as real route metadata.
//
// ROUTE PLACEMENT IS DELIBERATE. This lives in `(marketing)`, not `(portal)`.
// `(portal)` is out of scope per CLAUDE.md and already owns `/homeowners` and
// `/homeowner-portal`; nothing there was touched. If the owner decides this
// page belongs in the portal after all, that is a move for them to call — see
// the port report.
//
// No server actions, no API routes, no Prisma. Every figure on the page is
// static fixture copy, and the wizard's attachments and contact fields never
// leave the browser.

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
