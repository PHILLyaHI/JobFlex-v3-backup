import { db } from "@/lib/db";
import { PLAN_TIERS, type Plan } from "@/lib/entitlements";

/**
 * Resolve an org's effective feature tier.
 *
 * Two plan systems coexist: the built-in tier ladder (FREE/STARTER/PROFESSIONAL/
 * ENTERPRISE) that boolean feature-gating understands, and admin-defined
 * PricingPlans (arbitrary slugs) whose quotas are enforced by the numeric Limits
 * engine. When an org is assigned a custom PricingPlan, its slug won't match a
 * built-in tier — but it still means the org is on a real plan, so features are
 * unlocked here and the Limits engine (PricingPlan.limitsJson) does the metering.
 */
export async function getOrgPlanById(organizationId: string): Promise<Plan> {
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    select: { plan: true },
  });
  if (!sub?.plan) return "FREE";

  const upper = sub.plan.toUpperCase();
  // Built-in tier name → use it as-is.
  if ((PLAN_TIERS as readonly string[]).includes(upper)) return upper as Plan;

  // Custom assigned plan: confirm it maps to a real PricingPlan (case-insensitive),
  // then grant full feature access. Quotas come from that plan's limits, not here.
  const matched = await db.pricingPlan.findFirst({
    where: { slug: { in: [sub.plan, upper, sub.plan.toLowerCase()] } },
    select: { id: true },
  });
  return matched ? "ENTERPRISE" : "FREE";
}
