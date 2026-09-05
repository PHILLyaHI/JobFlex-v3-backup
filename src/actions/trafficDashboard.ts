"use server";

import { requirePlatformAdmin } from "@/lib/orgContext";
import { getTrafficReport } from "@/lib/traffic-server";
import { parseTrafficFilters } from "@/lib/traffic-query";

export async function getTrafficDashboard(input: Record<string, unknown> = {}) {
  await requirePlatformAdmin();
  return getTrafficReport(parseTrafficFilters(input));
}
