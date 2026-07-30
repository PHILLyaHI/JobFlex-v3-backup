// Main projects — Blueprint edition. Pixel-identical port of the projects
// donor (jobflex-projects-blueprint_2.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/new, /[id]) live under the (dashboard) route group and keep
// the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ProjectsContent } from "@/components/v3/projects-blueprint/projects-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Projects",
  description: "Projects — status filters and the full project book on one sheet.",
};

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fprojects");
  }

  return <ProjectsContent />;
}
