// Reports — the ONE loader both editions read.
//
// /dashboard/reports (desktop sheet + handheld build behind the viewport
// switch) and the /mobile-reports-v2 preview route call this. Every figure —
// revenue invoiced against collected, the pipeline funnel, conversion, average
// time to close and crew performance — comes from getReportsRollup(), which
// computes all four ranges in one pass so the range control switches without
// a round trip.

import { redirect } from "next/navigation";
import { NoOrgError, UnauthorizedError, requireOrg } from "@/lib/orgContext";
import { getReportsRollup, type ReportsRollup } from "@/actions/reports";

export type ReportsProps = { rollup: ReportsRollup };

/**
 * @param nextPath where the login redirect should return to — the route that
 *   called this, so a preview URL comes back to the preview.
 */
export async function loadReportsProps(nextPath: string): Promise<ReportsProps> {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const rollup = await getReportsRollup(organizationId);
  return { rollup };
}
