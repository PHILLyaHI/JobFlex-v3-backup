// Main dashboard — Blueprint edition. Pixel-identical port of the canonical
// donor (.claude/skills/jobflex-page-styler/assets/jobflex-dashboard-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ./layout.tsx, so this page renders only the donor's `.content` children —
// navigating between blueprint pages swaps the content and leaves the chrome
// standing.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { DashboardContent } from "@/components/v3/dashboard-blueprint/dashboard-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Overview",
  description:
    "The JobFlex operations overview — proposals, revenue, schedule and lead flow on one sheet.",
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard");
  }

  return <DashboardContent />;
}
