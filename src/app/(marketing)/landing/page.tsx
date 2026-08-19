// JobFlex marketing landing — PORT of the approved mockup
// `jobflex-landing (21).html` (route: /landing).
//
// CONVENTION (2026-08-11): a re-port REPLACES its predecessor in place — same
// route path, same component files. It does NOT fork a parallel `-blueprint`
// route beside the old one. This reverses the earlier side-by-side rule that
// this header used to assert (and that the staging route
// src/app/dashboard/subscription-blueprint/ recorded until its 2026-08-12
// promotion deleted it); /landing and src/components/v3/landing/* are
// overwritten, never duplicated.
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
//
// RESPONSIVE, since 2026-08-12. This one URL now serves TWO designs: the
// desktop build above 768px and a handheld rebuild at or below it
// (src/components/v3/mobile-landing/, also reachable on its own at
// /mobile-landing-v2). The switch itself is a client component —
// ./landing-responsive.tsx — because it needs a media-query store; this file
// stays a server component so the metadata export below is still static.
// The switch lives beside the page rather than in
// components/v3/responsive-shell/, which switches dashboard routes inside the
// blueprint app shell and does not apply to a (marketing) page that mounts no
// shell.

import type { Metadata, Viewport } from "next";
import { LandingResponsive } from "./landing-responsive";

export const metadata: Metadata = {
  title: "JobFlex — Quote. Schedule. Get paid.",
  description:
    "The operating system for contractors — smart proposals, a clear lead pipeline, scheduling, client portals, and payments in one workspace.",
};

// The route now has a handheld build, so it has to be read at true device width
// instead of at a synthetic 980px. `maximumScale` is deliberately NOT set —
// pinning it suppresses pinch-zoom and fails WCAG 2.2 SC 1.4.4 (Resize Text),
// which is not a trade worth making on a public marketing page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function LandingPage() {
  return <LandingResponsive />;
}
