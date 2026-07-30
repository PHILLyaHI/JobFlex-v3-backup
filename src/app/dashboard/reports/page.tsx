// Main reports — Blueprint edition. Pixel-identical port of the canonical
// reports donor (jobflex-reports-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ReportsContent } from "@/components/v3/reports-blueprint/reports-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Reports",
  description:
    "Reports — range switch, revenue against invoiced, the pipeline funnel, conversion and crew performance on one sheet.",
};

export default async function ReportsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Freports");
  }

  return <ReportsContent />;
}
