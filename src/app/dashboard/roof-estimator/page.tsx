// Roof estimator — Blueprint edition. Pixel-identical port of the canonical
// roof-estimator donor (jobflex-roof-estimator-blueprint_3.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
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

  return <RoofEstimatorContent />;
}
