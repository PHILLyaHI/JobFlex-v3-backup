// Main reports — Blueprint edition. Pixel-identical port of the canonical
// reports donor (jobflex-reports-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
//
// The sheet is NOT a fixture: every figure — revenue invoiced against
// collected, the pipeline funnel, conversion, average time to close and crew
// performance — is read from the database here by getReportsRollup() and handed
// to the content component, the same mechanism the workers page uses for its
// roster. All four ranges are computed in that one pass, so the range chips
// switch without a round trip.
//
// There was no flow to port: the classic reports route is a `<ComingSoon />`
// placeholder (archived at old-design-pages/dashboard/reports/page.tsx).

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireOrg, NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { getReportsRollup } from "@/actions/reports";
import { ReportsContent } from "@/components/v3/reports-blueprint/reports-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Reports",
  description:
    "Reports — range switch, revenue against invoiced, the pipeline funnel, conversion and crew performance on one sheet.",
};

export default async function ReportsPage() {
  let organizationId: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard%2Freports");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  const rollup = await getReportsRollup(organizationId);

  return <ReportsContent rollup={rollup} />;
}
