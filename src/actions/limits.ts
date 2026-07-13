"use server";
import { requireOrg } from "@/lib/orgContext";
import { checkPlanLimit, getOrgLimitUsage, type LimitStatus } from "@/lib/limitsEngine";
import type { LimitKey } from "@/lib/planLimits";

// requireOrg (not requireManager): usage numbers are org-internal and every
// role needs them for preflight — sales/workers hit the messages and calendar
// limits too.

/** Current usage/limit for one resource, scoped to the caller's org. */
export async function getLimitUsage(resource: LimitKey): Promise<LimitStatus> {
  const { organizationId } = await requireOrg();
  return checkPlanLimit(organizationId, resource);
}

/** Full usage snapshot across every limit for the caller's org. */
export async function getAllLimitUsage(): Promise<LimitStatus[]> {
  const { organizationId } = await requireOrg();
  return getOrgLimitUsage(organizationId);
}
