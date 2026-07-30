// Main leads — Blueprint edition. Pixel-identical port of the canonical
// leads donor (jobflex-leads-blueprint_3.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/[id], /kanban) live under the (dashboard) route group and
// keep the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { LeadsContent } from "@/components/v3/leads-blueprint/leads-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Leads",
  description: "Leads — pipeline tabs, the lead table, the stage board and the import bench on one sheet.",
};

export default async function LeadsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fleads");
  }

  return <LeadsContent />;
}
