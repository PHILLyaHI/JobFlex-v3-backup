// HVAC inventory — the HVAC price book and stock, under the HVAC estimator
// (owner, 2026-10-10). The page itself is TradeInventoryPage.

import type { Metadata } from "next";
import { TradeInventoryPage } from "@/components/v3/inventory-blueprint/inventory-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · HVAC inventory", description: "Your HVAC price book and stock." };

export default function HVACInventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TradeInventoryPage trade="hvac" searchParams={searchParams} />;
}
