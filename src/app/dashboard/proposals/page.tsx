// Main proposals — Blueprint edition. Pixel-identical port of the canonical
// proposals donor (jobflex-proposals-blueprint.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/new, /create, /[id], /ai, /templates) live under the
// (dashboard) route group and keep the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { ProposalsContent } from "@/components/v3/proposals-blueprint/proposals-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Proposals",
  description: "Proposals — masthead, pipeline tabs and the full proposal book on one sheet.",
};

export default async function ProposalsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fproposals");
  }

  return <ProposalsContent />;
}
