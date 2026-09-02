// MOBILE OVERHEAD — /mobile-overhead-v1
//
// The direct-review entry point for the handheld build of Financials →
// Overhead: always the mobile design, at any width, so the composition can be
// opened on a desktop browser without resizing. The desktop surface at
// /dashboard/financials keeps its own Overhead tab, untouched — this route
// stands beside it, per the mobile route strategy.
//
// REAL DATA, NOT A FIXTURE. This page loads exactly what the desktop financials
// page loads for that tab — `getMonthlyRollup(orgId, 12)` folded by
// `toOverheadMonths`, plus every sheet the org has saved — so the preview URL
// and the live URL describe the same records and cannot drift. The one write
// the page makes is the same manager-gated `saveMonthlyOverhead` action.
//
// Auth: middleware only matches /dashboard and /admin, so this route enforces
// its own redirect-to-login like every other (mobile) design route — the same
// requireOrg / UnauthorizedError / NoOrgError shape as
// src/app/(mobile)/mobile-job-detail-v1/[id]/page.tsx.

import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { getMonthlyRollup } from "@/actions/financials";
import { getOverheadSheets, toOverheadMonths } from "@/lib/overhead";
import { MobileOverhead } from "@/components/v3/mobile-overhead/mobile-overhead";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Overhead · JobFlex Mobile",
  description:
    "What the business costs to keep alive each month, and whether the month's jobs covered it.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the shell reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileOverheadV1Page() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent("/mobile-overhead-v1")}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // Twelve months of job money and the whole book of sheets. Both are small,
  // and handing them over together is what lets the month cursor step without
  // a round trip — see the note in the component.
  const [monthly, sheets] = await Promise.all([
    getMonthlyRollup(organizationId, 12),
    getOverheadSheets(organizationId),
  ]);

  return <MobileOverhead months={toOverheadMonths(monthly)} sheets={sheets} />;
}
