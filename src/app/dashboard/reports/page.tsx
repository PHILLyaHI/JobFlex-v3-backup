// Main reports — Blueprint edition. Pixel-identical port of the canonical
// reports donor (jobflex-reports-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
//
// The sheet is NOT a fixture: every figure — revenue invoiced against
// collected, the pipeline funnel, conversion, average time to close and crew
// performance — is read from the database by getReportsRollup() in
// ./load-reports and handed to BOTH editions through ./reports-responsive —
// the desktop sheet above 768px, the handheld build at or below. All four
// ranges are computed in that one pass, so the range control switches without
// a round trip.
//
// There was no flow to port: the classic reports route is a `<ComingSoon />`
// placeholder (archived at old-design-pages/dashboard/reports/page.tsx).

import type { Metadata } from "next";
import { loadReportsProps } from "./load-reports";
import { ReportsResponsive } from "./reports-responsive";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Reports",
  description:
    "Reports — range switch, revenue against invoiced, the pipeline funnel, conversion and crew performance on one sheet.",
};

export default async function ReportsPage() {
  const props = await loadReportsProps("/dashboard/reports");
  return <ReportsResponsive {...props} />;
}
