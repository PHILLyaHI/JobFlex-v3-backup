// The HVAC equipment catalog (2026-10-09): what the estimator picks from, by
// category, brand and product line — the shop's own rows, costs and switches,
// checked against its state's code. The shell (sidebar, topbar) comes from
// ../../layout.tsx; this page renders the `.content` children.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { customPageGate } from "@/components/v3/upgrade-gate/custom-page-gate";
import { getHvacCatalogPage } from "@/actions/hvacCatalog";
import { HvacCatalogContent } from "@/components/v3/hvac-catalog/hvac-catalog-content";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "JobFlex · HVAC catalog",
  description: "The equipment the estimator picks from — by category, brand and product line, with your costs, checked against your state's code.",
};

export default async function HvacCatalogPage() {
  const gate = await customPageGate("hvac-estimator");
  if (gate) return gate;
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=%2Fdashboard%2Fhvac-estimator%2Fcatalog");
  const initial = await getHvacCatalogPage();
  return <HvacCatalogContent initial={initial} />;
}
