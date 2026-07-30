// Hire — Blueprint edition. Pixel-identical port of the canonical hire donor
// (jobflex-hire-blueprint_4.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/hub, /talent, /profile, /job-posts, /applications,
// /contracts, /new, /[id]) live under the (dashboard) route group and keep the
// classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { HireContent } from "@/components/v3/hire-blueprint/hire-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Hire",
  description: "Hire — the marketplace hub and the applicant pipeline on one sheet.",
};

export default async function HirePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fhire");
  }

  return <HireContent />;
}
