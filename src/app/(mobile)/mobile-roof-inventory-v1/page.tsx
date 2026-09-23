// MOBILE ROOFING INVENTORY — /mobile-roof-inventory-v1
//
// The handheld build of the roofing inventory redesign (2026-09-22), standing
// beside the desktop board at /dashboard/roof-estimator/board, which is
// untouched. Always the mobile design, at any width, so the composition can be
// reviewed on a desktop browser without resizing.
//
// REAL DATA, NOT A FIXTURE: the same two reads the desktop board makes —
// lib/inventoryBoard for the shelf, the proposals and the suppliers,
// lib/inventoryDashboard for value, pace, history and the next loads — and the
// same manager-gated writes in actions/inventory. Sales and estimator roles
// read it; the (mobile) layout applies the desktop board's route gates.

import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { loadTradeBoard } from "@/lib/inventoryBoard";
import { loadStockFacts } from "@/lib/inventoryDashboard";
import { MobileRoofInventory } from "@/components/v3/mobile-roof-inventory-claude/mobile-roof-inventory";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Roofing inventory · JobFlex Mobile",
  description: "What is on the roofing shelf, what the sold jobs take, and what to order from whom.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default async function MobileRoofInventoryV1Page() {
  let organizationId: string;
  let role: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect(`/auth/login?next=${encodeURIComponent("/mobile-roof-inventory-v1")}`);
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }
  const data = await loadTradeBoard(organizationId, "roof");
  if (!data) redirect("/dashboard/roof-estimator");
  const facts = await loadStockFacts(
    organizationId,
    "roof",
    data.proposals.filter((p) => p.linked && p.status === "ACCEPTED" && !p.loaded).map((p) => p.id),
  );
  return <MobileRoofInventory data={data} facts={facts} canWrite={!isLimitedRole(role)} />;
}
