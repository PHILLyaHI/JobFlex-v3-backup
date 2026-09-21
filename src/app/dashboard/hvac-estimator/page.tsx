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
import { db } from "@/lib/db";
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

export default async function HvacEstimatorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fhvac-estimator");
  }
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Opened from a client's record (the estimator picker adds `?client=`): the
  // client's address is already in the field. Read from this org only.
  let initialAddress: string | undefined;
  const clientId = one(params.client);
  if (clientId) {
    const orgId = (await db.user.findUnique({ where: { id: session.user.id }, select: { activeOrgId: true } }))?.activeOrgId;
    const client = orgId ? await db.client.findFirst({ where: { id: clientId, organizationId: orgId, deletedAt: null }, select: { address: true, city: true, state: true, zip: true } }) : null;
    if (client?.address) initialAddress = [client.address, client.city, [client.state, client.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }
  return <HvacEstimatorContent aiEnabled={isOpenAIEnabled()} initialAddress={initialAddress} />;
}
