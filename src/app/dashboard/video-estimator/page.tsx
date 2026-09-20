// Video estimator — Blueprint edition. Pixel-identical port of the canonical
// donor `jobflex-videoestimator-blueprint.html`, wired to the real pipeline
// (components/v3/video-estimator-blueprint/use-video-estimator.ts).
//
// The sidebar, topbar and shared sprite come from the shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
//
// Two facts are read here, on the server, because the page below is a client
// tree: whether the estimator key is configured (so Analyze can explain itself
// instead of failing three stages in), and the org's next estimate number —
// the figure the Job ticket's № stamp prints, in place of the donor's fixture.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireOrg } from "@/lib/orgContext";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { VideoEstimatorViewportSwitch } from "@/components/v3/video-estimator-blueprint/video-estimator-viewport-switch";

export const dynamic = "force-dynamic";
// A server action runs under the segment config of the page that calls it,
// so the ceiling is set here: a reasoning model (gpt-5) thinks for a minute
// or more, and the estimate can be asked again after a validation pass
// (2026-09-19, set up so OPENAI_MODEL can move to gpt-5).
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "JobFlex · Video Estimator",
  description:
    "Walk the job on video. The frames are read, the audio is transcribed, and the estimate is priced against live retail.",
};

export default async function VideoEstimatorPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fvideo-estimator");
  }

  let ticketNo = 1;
  try {
    const { organizationId } = await requireOrg();
    ticketNo = (await db.aiEstimate.count({ where: { organizationId } })) + 1;
  } catch {
    // No org yet — the layout's own gate decides what happens; the stamp
    // prints 1 rather than the page failing over a number.
  }

  // The switch, not the desktop page: at ≤768px this URL serves the handheld
  // build instead (video-estimator-viewport-switch.tsx). Both editions take the
  // same two props, so the choice is a layout, never a dataset.
  return <VideoEstimatorViewportSwitch ticketNo={ticketNo} aiEnabled={isOpenAIEnabled()} />;
}
