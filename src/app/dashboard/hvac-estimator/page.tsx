// HVAC estimator — Blueprint edition. Replacement-first: site facts from the
// records, a video walk and nameplate photos for what is there, a block load
// at the county's design day, the unit the shop's catalog fits, the checks,
// and a priced ledger from the shop's rate card. The engine itself is pure
// (src/lib/hvac) and runs in the browser; the server does the lookups, the
// plate reading, the catalog, the rate card and the proposal.
//
// The sidebar and topbar come from the shared shell mounted in ../layout.tsx,
// so this page renders only the `.content` children.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { isOpenAIEnabled } from "@/lib/sdk/openai";
import { HvacEstimatorContent } from "@/components/v3/hvac-estimator-blueprint/hvac-estimator-content";

export const dynamic = "force-dynamic";
// A server action runs under the segment config of the page that calls it,
// so the ceiling is set here: a reasoning model (gpt-5) thinks for a minute
// or more, and the estimate can be asked again after a validation pass
// (2026-09-19, set up so OPENAI_MODEL can move to gpt-5).
export const maxDuration = 300;

export const metadata: Metadata = {
  title: "JobFlex · HVAC Estimator",
  description: "HVAC estimator — walk the house on video, read the plates, size the system and price the replacement.",
};

export default async function HvacEstimatorPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fhvac-estimator");
  }
  return <HvacEstimatorContent aiEnabled={isOpenAIEnabled()} />;
}
