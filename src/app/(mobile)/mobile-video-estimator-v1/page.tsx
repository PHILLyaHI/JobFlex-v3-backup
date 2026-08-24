// VIDEO ESTIMATOR — handheld preview. Route: /mobile-video-estimator-v1.
//
// A separate URL beside the desktop /dashboard/video-estimator, which is
// UNTOUCHED, per the mobile route strategy. Nothing is wired to switch the
// desktop route over to this build.
//
// It serves BOTH steps of the flow — the walkthrough intake and the result
// sheet — re-composed as one vertical document for a phone. See the header of
// ../../../components/v3/mobile-video-estimator/mobile-video-estimator.tsx.
//
// Built with the jobflex-page-styler and mobile-app-ui-design skills.
//
// The page below is a client tree, so the two server-read facts it needs are
// read here, exactly as the desktop route reads them: whether the estimator key
// is configured (so Analyze can explain itself instead of failing three stages
// in), and the org's next estimate number — the figure the Job ticket's №
// stamp prints.
//
// Auth: middleware only matches /dashboard and /admin, so this route enforces
// its own redirect-to-login, like every other (mobile) design route.

import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/orgContext";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { MobileVideoEstimator } from "@/components/v3/mobile-video-estimator/mobile-video-estimator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Video estimator · JobFlex Mobile",
  description:
    "Blueprint-edition mobile video estimator: a walkthrough read frame by frame, measured, and priced into an estimate.",
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

export default async function MobileVideoEstimatorV1Page() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/login?next=${encodeURIComponent("/mobile-video-estimator-v1")}`);
  }

  let ticketNo = 1;
  try {
    const { organizationId } = await requireOrg();
    ticketNo = (await db.aiEstimate.count({ where: { organizationId } })) + 1;
  } catch {
    // No org yet — the stamp prints 1 rather than the page failing over a
    // number, the same fallback the desktop route takes.
  }

  return <MobileVideoEstimator ticketNo={ticketNo} aiEnabled={isOpenAIEnabled()} />;
}
