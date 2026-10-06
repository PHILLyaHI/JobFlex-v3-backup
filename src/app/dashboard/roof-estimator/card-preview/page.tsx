// Design preview of the roof estimator's "Build an estimate" card on a sample
// house — see build-estimate-card-preview.tsx. Same shell and page styles as
// /dashboard/roof-estimator (the shell keys page styles on the first segment).

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { BuildEstimateCardPreview } from "@/components/v3/roof-estimator-blueprint/build-estimate-card-preview";
import { customPageGate } from "@/components/v3/upgrade-gate/custom-page-gate";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Build card preview",
};

export default async function BuildCardPreviewPage() {
  const gate = await customPageGate("roof-estimator");
  if (gate) return gate;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Froof-estimator%2Fcard-preview");
  }
  return <BuildEstimateCardPreview />;
}
