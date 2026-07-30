// Company — Blueprint edition. Pixel-identical port of the canonical company
// donor (jobflex-company-blueprint_3.html).
//
// The sidebar, topbar and shared sprite come from the shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// Child routes (/activity, /landing, /subscription, /team) live under the
// (dashboard) route group and keep the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { CompanyContent } from "@/components/v3/company-blueprint/company-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Company",
  description: "Company — branding, team, team activity and the landing builder on one sheet.",
};

export default async function CompanyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Fcompany");
  }

  return <CompanyContent />;
}
