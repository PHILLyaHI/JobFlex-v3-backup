// Roof estimator — Blueprint edition. The blueprint chrome is the donor's
// (jobflex-roof-estimator-blueprint_3.html); the FLOW is the real one from
// /dashboard/advanced-ai/roof, mounted by roof-estimator-content.
//
// The sidebar and topbar come from the shared shell mounted in ../layout.tsx,
// so this page renders only the `.content` children.
//
// The two capability flags are read HERE because both helpers read process.env
// on the server. They gate the same things they gate on the classic route:
// without EagleView the form renders its "not configured" card instead of an
// intake, and without an OpenAI key the estimate generator returns a sample.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { isEagleViewEnabled } from "@/lib/eagleview";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { RoofEstimatorContent } from "@/components/v3/roof-estimator-blueprint/roof-estimator-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Roof Estimator",
  description:
    "Roof estimator — order a measurement report, read the facets and linear footage, then price the takeoff.",
};

export default async function RoofEstimatorPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Froof-estimator");
  }

  // SERVER flag (deliberately not NEXT_PUBLIC): while the 2D/3D engine is
  // being reworked, the page shows the data-only view — Instant numbers, ortho
  // with the outline, no reconstruction run at all. ROOF_DRAWING_ENABLED=true
  // opts back into the drawing tool.
  //
  // OPT-IN since 2026-09-05. It used to be opt-out ("anything but false keeps
  // the drawing tool"), and the live deploy — which had never been given the
  // flag — showed the drawing tool while every local run had it set to false.
  // Two different roof pages for one commit, and the live one depended on a
  // server Google key entitled to Geocoding + Solar that the deploy did not
  // have. A deploy with no flag now gets the same page as local dev.
  const drawingEnabled = process.env.ROOF_DRAWING_ENABLED === "true";

  return (
    <RoofEstimatorContent
      evEnabled={isEagleViewEnabled()}
      aiEnabled={isOpenAIEnabled()}
      drawingEnabled={drawingEnabled}
    />
  );
}
