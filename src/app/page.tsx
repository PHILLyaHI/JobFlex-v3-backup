// `/` — the BLUEPRINT landing, promoted (owner call, 2026-08-23).
//
// Until now the root URL served a hand-written marketing page while the
// approved blueprint port lived at /landing; the owner asked for the root to
// carry the new design. This renders the SAME LandingResponsive the /landing
// route mounts — one implementation, two entry points, so the two URLs cannot
// drift — and keeps the one behaviour the old root page had that the port did
// not: a signed-in visitor is sent to work instead of marketing.
//
// /landing itself stays up (its own metadata, same component). The old root
// page's markup is gone with this file's history — it was a predecessor
// design, not a donor port.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingResponsive } from "./(marketing)/landing/landing-responsive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex \u2014 Quote. Schedule. Get paid.",
  description:
    "The operating system for contractors \u2014 smart proposals, a clear lead pipeline, scheduling, client portals, and payments in one workspace.",
};

// Read at true device width — the route serves a handheld build at \u2264768px.
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
  return <LandingResponsive />;
}
