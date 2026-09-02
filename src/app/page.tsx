// `/` — the LANDING-D design, promoted (owner call, 2026-08-25).
//
// The root previously served the blueprint landing (LandingResponsive, shared
// with /landing). The owner asked for the ported landing-d design to carry the
// root; this renders the SAME <LandingD /> that /landing-d mounts — one
// implementation, two entry points, so the two URLs cannot drift — and keeps
// the one behaviour the marketing pages do not have: a signed-in visitor is
// sent to work instead of to a pitch.
//
// /landing and /landing-d both stay up, each with its own metadata.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingD } from "@/components/v3/landing-d/landing-d-page";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex — Turn your trade into a business",
  description:
    "The operating system for small-shop contractors — estimating, proposals, scheduling, jobs, and invoicing in one workspace.",
};

// Read at true device width — the page carries its own handheld build.
// `maximumScale` is deliberately NOT set: pinning it suppresses pinch-zoom and
// fails WCAG 2.2 SC 1.4.4 on a public marketing page.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function HomePage() {
  // Signed-in users have no use for the marketing landing — send them to work.
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  return <LandingD />;
}
