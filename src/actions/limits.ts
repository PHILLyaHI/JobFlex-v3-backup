"use server";
import { requireManager } from "@/lib/orgContext";
import { checkPlanLimit, getOrgLimitUsage, type LimitStatus } from "@/lib/limitsEngine";
import type { LimitKey } from "@/lib/planLimits";

/** Current usage/limit for one resource, scoped to the caller's org. */
export async function getLimitUsage(resource: LimitKey): Promise<LimitStatus> {
  const { organizationId } = await requireManager();
  return checkPlanLimit(organizationId, resource);
}

/** Full usage snapshot across every limit for the caller's org. */
export async function getAllLimitUsage(): Promise<LimitStatus[]> {
  const { organizationId } = await requireManager();
  return getOrgLimitUsage(organizationId);
}
