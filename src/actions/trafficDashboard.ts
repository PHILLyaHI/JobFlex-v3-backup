"use server";

import { requirePlatformAdmin } from "@/lib/orgContext";
import { getStageVisitors, getTrafficReport } from "@/lib/traffic-server";
import { parseTrafficFilters } from "@/lib/traffic-query";

export async function getTrafficDashboard(input: Record<string, unknown> = {}) {
  await requirePlatformAdmin();
  return getTrafficReport(parseTrafficFilters(input));
}

/** Who reached a funnel stage: device, place, source and how far they got. */
export async function getTrafficStageVisitors(input: Record<string, unknown> = {}, stageId: unknown) {
  await requirePlatformAdmin();
  if (typeof stageId !== "string" || !/^[a-z]+$/.test(stageId)) throw new Error("Choose a funnel stage.");
  return getStageVisitors(parseTrafficFilters(input), stageId);
}
