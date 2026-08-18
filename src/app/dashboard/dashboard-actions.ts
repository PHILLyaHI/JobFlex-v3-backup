"use server";

// Overview — the handheld build's door to the page's own read.
//
// The desktop edition is a server component and awaits `buildDashboardData`
// directly. The handheld edition cannot: `ResponsiveDashboardShell` mounts it
// PROPS-LESS (and `ssr: false`) once the viewport crosses 768px, so there is no
// server render in its path to hand it rows. This is that render, exposed as a
// read-only action.
//
// No new data layer: it awaits exactly the function ./page.tsx awaits, which is
// exactly the queries the classic overview ran. `requireOrg()` inside it means
// the org scope and the sales-rep lead slice are enforced on this path too —
// the action takes no arguments, so there is nothing a caller could widen.

import { buildDashboardData } from "./dashboard-data";
import type { DashboardData } from "@/components/v3/dashboard-blueprint/blueprint-data";

export async function getDashboardData(): Promise<DashboardData> {
  return buildDashboardData();
}
