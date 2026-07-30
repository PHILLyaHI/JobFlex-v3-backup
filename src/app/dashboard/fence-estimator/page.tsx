// Fence estimator ("Fence studio") — Blueprint edition. Pixel-identical port of
// the canonical fence-estimator donor (jobflex-fence-estimator-blueprint_7.html).
//
// The sidebar, topbar and shared sprite come from the shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// A brand-new route: nothing was archived, and the separate AI fence flow under
// (dashboard)/dashboard/advanced-ai/fence stays untouched.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { FenceEstimatorContent } from "@/components/v3/fence-estimator-blueprint/fence-estimator-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Fence Estimator",
  description:
    "Fence studio — trace the run on the map, swap material, height and gates, and watch the estimate update live.",
};

export default async function FenceEstimatorPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Ffence-estimator");
  }

  return <FenceEstimatorContent />;
}
