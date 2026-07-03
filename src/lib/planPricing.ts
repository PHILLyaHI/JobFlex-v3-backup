// Server-safe plan pricing fallback (NOT a "use client" module), so server
// components can estimate MRR without importing a client component. The Stripe
// PlanPrice mirror is the real source once plans are synced; this is the fallback.
export const PLAN_MONTHLY_USD: Record<string, number> = {
  FREE: 0,
  STARTER: 29,
  PROFESSIONAL: 99,
  ENTERPRISE: 299,
};

export function planMrr(plan: string): number {
  return PLAN_MONTHLY_USD[plan] ?? 0;
}
