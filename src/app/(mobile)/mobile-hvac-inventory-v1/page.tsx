// MOBILE HVAC INVENTORY — /mobile-hvac-inventory-v1
//
// The handheld preview of the HVAC board ("HVAC inventory" under the HVAC
// estimator in the sidebar): always the phone design, at any width, so it can
// be reviewed without resizing. The live board at
// /dashboard/hvac-estimator/board is untouched and keeps its own shared
// handheld layout (roofing-inventory-mobile.tsx); this route stands beside it.
//
// REAL DATA, NOT A FIXTURE. The loads are the desktop board page's, in its
// order and with its canWrite rule: requireOrg → loadTradeBoard(org, "hvac")
// → loadStockFacts(org, "hvac", the sold-and-not-loaded linked proposals).
// Every write the page makes goes through the same model hook the board uses
// (useRoofingInventory → actions/inventory, manager-gated server-side).
//
// Auth: middleware only matches /dashboard and /admin, so this route redirects
// to login itself, the same requireOrg / UnauthorizedError / NoOrgError shape
// as /mobile-overhead-v1. The (mobile) group layout gates only the handheld
// URLs it has mapped to a desktop twin, and this one is not mapped there — so
// the two gates the dashboard layout applies to the board are applied here,
// with the same helpers, against the board's own path: a limited role whose
// allow-list does not reach the board is sent to its home surface, and a
// custom plan that did not buy the HVAC estimator gets the upgrade offer.

import { redirect } from "next/navigation";
import type { Metadata, Route, Viewport } from "next";
import { MobileHvacInventory } from "@/components/v3/mobile-hvac-inventory/mobile-hvac-inventory";
import { UpgradeGate } from "@/components/v3/upgrade-gate/upgrade-gate";
import { getBlockedCustomPages } from "@/lib/customPageAccess";
import { isCustomBlockedPath } from "@/lib/customPlan";
import { loadTradeBoard } from "@/lib/inventoryBoard";
import { loadStockFacts } from "@/lib/inventoryDashboard";
import { isLimitedRole, NoOrgError, requireOrg, UnauthorizedError } from "@/lib/orgContext";
import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "HVAC inventory · JobFlex Mobile",
  description: "What the shop keeps on the shelf, what to order, and what the sold HVAC jobs will take.",
};

// Handheld build: laid out at true device width, with the notch and
// home-indicator insets paid out. Pinch zoom is left on — every field on the
// page is 16px or larger, so iOS never auto-zooms on focus.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

/** The desktop route this preview mirrors — the path both gates are keyed on. */
const BOARD_PATH = "/dashboard/hvac-estimator/board";

export default async function MobileHvacInventoryV1Page() {
  let organizationId: string;
  let role: string;
  try {
    const ctx = await requireOrg();
    organizationId = ctx.organizationId;
    role = ctx.role;
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      redirect(`/auth/login?next=${encodeURIComponent("/mobile-hvac-inventory-v1")}`);
    }
    if (err instanceof NoOrgError) redirect("/dashboard?error=forbidden");
    throw err;
  }

  // Fail-closed role gate, as src/app/dashboard/layout.tsx applies it to the
  // board: only a role WITH a gate is restricted.
  const gate = ROLE_ROUTE_GATES[role];
  if (gate && !isPathAllowed(gate, BOARD_PATH)) redirect(gate.home as Route);

  // The custom plan's page gate — rendered at this URL, never the page. One
  // retry, the layouts' own shape: a swallowed read is the gate failing open.
  const lockedPages = await getBlockedCustomPages(organizationId).catch(() =>
    getBlockedCustomPages(organizationId),
  );
  if (isCustomBlockedPath(lockedPages, BOARD_PATH)) return <UpgradeGate pathname={BOARD_PATH} />;

  const data = await loadTradeBoard(organizationId, "hvac");
  if (!data) redirect("/dashboard/hvac-estimator");
  // The dashboard's extra facts — value, pace, history, the next loads.
  const facts = await loadStockFacts(
    organizationId,
    "hvac",
    data.proposals.filter((p) => p.linked && p.status === "ACCEPTED" && !p.loaded).map((p) => p.id),
  );

  return <MobileHvacInventory data={data} facts={facts} canWrite={!isLimitedRole(role)} />;
}
