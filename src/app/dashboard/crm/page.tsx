// CRM — Blueprint edition. Pixel-identical port of the canonical CRM donor
// (jobflex-crm-blueprint_1.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/customers, /queue, /workflows) live under the (dashboard)
// route group and keep the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CrmContent } from "@/components/v3/crm-blueprint/crm-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · CRM",
  description:
    "CRM — overview, customer book, follow-up workflow rules and the follow-up queue on one sheet.",
};

export default async function CrmPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fcrm");
  }

  return <CrmContent />;
}
