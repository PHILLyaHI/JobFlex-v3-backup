import { db } from "@/lib/db";
import { getOrgPlan, type Plan } from "@/lib/entitlements";

export async function getOrgPlanById(organizationId: string): Promise<Plan> {
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    select: { plan: true },
  });
  return getOrgPlan(sub);
}
