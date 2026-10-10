// Roofing inventory — the roofing price book and stock, under the roof estimator
// (owner, 2026-10-10). The page itself is TradeInventoryPage.

import type { Metadata } from "next";
import { TradeInventoryPage } from "@/components/v3/inventory-blueprint/inventory-page";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "JobFlex · Roofing inventory", description: "Your roofing price book and stock." };

export default function RoofingInventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <TradeInventoryPage trade="roof" searchParams={searchParams} />;
}
