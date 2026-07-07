// Static LAST-RESORT plan pricing table. The live sources are, in order:
// planCatalogServer.getMonthlyCentsBySlugUpper() (admin-managed PricingPlan
// rows) and the Stripe PlanPrice mirror. Only consult this when a slug is
// missing from the catalog entirely (e.g. an orphaned subscription).
export const PLAN_MONTHLY_USD: Record<string, number> = {
  FREE: 0,
  STARTER: 29,
  PROFESSIONAL: 79,
  ENTERPRISE: 199,
};

export function planMrr(plan: string): number {
  return PLAN_MONTHLY_USD[plan] ?? 0;
}
