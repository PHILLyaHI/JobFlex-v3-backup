// `/` — the landing. landing-e, promoted (owner call, 2026-09-16).
//
// landing-d carried the root from 2026-08-25; landing-e was its test copy at
// /landing-e (2026-09-10) with the honest trial copy, the three-field
// register, the first-estimate card, the welcome email and Google One Tap.
// The owner kept e and dropped d: this renders <LandingE /> from
// components/v3/landing-e, /landing-e redirects here, and landing-d is gone.
// Signed-in visitors are sent to work instead of to a pitch.
//
// TRADE VARIANT (2026-09-06). `?industry=fencing` (alias `?trade=`) swaps the
// hero for the fence estimator's; see landing-e/landing-variants.ts. Resolved
// HERE, on the server, from the query ONLY, so the first byte already carries
// the right hero — no client-side detection, no swap after paint. The
// jf_industry cookie is never consulted for the landing (owner, 2026-09-10):
// no parameter is always the default page; the cookie only pre-selects the
// trade on /auth/register. An unknown value is the default page too.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LandingE } from "@/components/v3/landing-e/landing-e-page";
import { readLandingVariant } from "@/components/v3/landing-e/landing-variant-server";

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

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Signed-in users have no use for the marketing landing — send them to work.
  const session = await auth();
  if (session?.user?.id) redirect("/dashboard");
  const landing = readLandingVariant(await searchParams);
  return <LandingE {...landing} />;
}
