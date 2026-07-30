// Main financials — Blueprint edition. Pixel-identical port of the canonical
// financials donor (jobflex-financials-blueprint_7.html).
//
// The sidebar, topbar and sprite come from the shared shell mounted in
// ../layout.tsx, so this page renders only the donor's `.content` children.
// The child routes (/expenses, /invoices, /change-orders) live under the
// (dashboard) route group and keep the classic layout.

import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { FinancialsContent } from "@/components/v3/financials-blueprint/financials-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "JobFlex · Financials",
  description:
    "Financials — revenue against expenses, margin gauge, receipt capture and the expense, change-order and invoice books on one sheet.",
};

export default async function FinancialsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/login?next=%2Fdashboard%2Ffinancials");
  }

  return <FinancialsContent />;
}
