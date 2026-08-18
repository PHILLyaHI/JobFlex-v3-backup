// Main dashboard — Blueprint edition. Pixel-identical port of the canonical
// donor (.claude/skills/jobflex-page-styler/assets/jobflex-dashboard-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ./layout.tsx, so this page renders only the donor's `.content` children —
// navigating between blueprint pages swaps the content and leaves the chrome
// standing.
//
// This page is NOT a fixture. Every region on the sheet — the KPI strip, the
// revenue chart's three ranges, Recent Activity, This Week, Upcoming Jobs and
// the Lead Flow board — is read from the database by `buildDashboardData` and
// handed to the behavior module, and the board's drag persists through
// `updateLeadStatus`. That read lives in ./dashboard-data.ts rather than here
// because the handheld edition needs the same rows and is mounted props-less
// by the responsive shell; see ./dashboard-actions.ts.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { NoOrgError, UnauthorizedError } from "@/lib/orgContext";
import { DashboardContent } from "@/components/v3/dashboard-blueprint/dashboard-content";
import type { DashboardData } from "@/components/v3/dashboard-blueprint/blueprint-data";
import { buildDashboardData } from "./dashboard-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Overview",
  description:
    "The JobFlex operations overview — proposals, revenue, schedule and lead flow on one sheet.",
};

export default async function DashboardPage() {
  let data: DashboardData;
  try {
    data = await buildDashboardData();
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/auth/login?next=%2Fdashboard");
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  return <DashboardContent data={data} />;
}
