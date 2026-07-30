// Main jobs — Blueprint edition. Pixel-identical port of the canonical jobs
// donor (jobflex-jobs-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/new, /[id]) live under the (dashboard) route group and keep
// the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { JobsContent } from "@/components/v3/jobs-blueprint/jobs-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Jobs",
  description: "Jobs — status tabs and the full delivery board on one sheet.",
};

export default async function JobsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fjobs");
  }

  return <JobsContent />;
}
