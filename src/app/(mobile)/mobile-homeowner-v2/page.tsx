// /mobile-homeowner-v2 — the handheld homeowner marketing page, standalone.
//
// This is the PREVIEW entry point. The same component also serves /homeowner at
// ≤768px through the media-query switch in
// src/app/(marketing)/homeowner/homeowner-responsive.tsx — imported there out
// of this route group rather than copied, so the two URLs cannot drift apart.
//
// A server component so the desktop page's <title> and <meta name="description">
// ship as real route metadata here too; the page body is a client component
// because the wizard, the vignettes, the count-up and the band parallax all
// need the browser.
//
// No layout file: this is a standalone marketing page carrying its own nav and
// footer, exactly like its desktop counterpart. It is deliberately NOT mounted
// inside blueprint-shell and it does not use the handheld fleet's MobileNav —
// a public marketing route has no app chrome to inherit.

import type { Metadata } from "next";
import { MobileHomeowner } from "@/components/v3/mobile-homeowner/mobile-homeowner";

export const metadata: Metadata = {
  title: "JobFlex Homeowner Portal — Describe your project, get real quotes",
  description:
    "Describe your project in plain English. JobFlex turns it into a contractor-ready scope and verified local pros send line-item quotes — free, no account required.",
};

export default function MobileHomeownerPreviewPage() {
  return <MobileHomeowner />;
}
