// Smart Proposal · Estimate — handheld preview. Route: /mobile-smart-estimate-v1.
//
// A separate URL beside the desktop /dashboard/advanced-ai, which is untouched,
// per the mobile route strategy. It serves ONLY the estimate (result) screen —
// the intake console that produces it is not ported; see the header of
// ../../../components/v3/mobile-smart-estimate/mobile-smart-estimate.tsx.
//
// Built with the jobflex-page-styler and mobile-app-ui-design skills.
//
// Auth: middleware only matches /dashboard and /admin, so this route enforces
// its own gate — the same `requireOrg` + UnauthorizedError / NoOrgError pair the
// desktop route uses, so the two surfaces agree on who may see the estimate.

import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { MobileSmartEstimate } from "@/components/v3/mobile-smart-estimate/mobile-smart-estimate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Smart Proposal estimate",
  description:
    "Smart Proposal — the estimate that prices materials, labor and scope on one sheet, and rewrites itself from a sentence.",
};

// Handheld build: lock the scale so the layout is read at true device width,
// and pay out the notch / home-indicator insets the sticky action bar reserves.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f2f0eb",
};

export default async function MobileSmartEstimateV1Page() {
  try {
    await requireOrg();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent("/mobile-smart-estimate-v1")}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <MobileSmartEstimate />;
}
