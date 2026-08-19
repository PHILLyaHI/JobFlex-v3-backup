// Pure, client-safe plan-catalog definitions.
//
// NO server imports here (no Prisma, no "use server") — the pattern mirrors
// planLimits.ts (client-safe half) vs limitsEngine.ts (server half). The server
// fetchers live in planCatalogServer.ts; every surface that *renders* plan data
// consumes the PlanDTO + helpers from this file.
//
// PricingPlan (the /admin/plans table) is the single source of truth for plan
// names, prices, feature copy, limits, and visibility. Boolean feature *gating*
// stays code-driven in entitlements.ts (MINIMUM_PLAN_FOR).

import { PLAN_TIERS, type Plan } from "@/lib/entitlements";
import type { PlanLimits } from "@/lib/planLimits";

export interface PlanDTO {
  id: string;
  slug: string; // canonical lowercase; join key to PlanPrice.planSlug + Subscription.plan
  name: string;
  description: string | null;
  priceCents: number; // monthly
  yearlyPriceCents: number | null;
  trialDays: number;
  order: number;
  features: string[]; // parsed from the JSON `features` column
  limits: PlanLimits; // parsed from limitsJson; absent key = unlimited
  active: boolean;
  highlight: boolean; // "Most popular" badge
  isFree: boolean; // priceCents === 0 — no Stripe checkout, assigned via setOrgPlan
}

/** "$0" / "$29" / "$29.99" — every surface renders a plan price through this. */
export function formatPlanPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** Cadence copy next to a price: "per month" (or "/mo"). */
export function priceCadence(short = false): string {
  return short ? "/mo" : "per month";
}

/**
 * CTA label for a plan's buy button: "Start N-day trial" when the plan has a
 * trial, else "Subscribe".
 */
export function planCtaLabel(trialDays: number): string {
  if (trialDays > 0) return `Start ${trialDays}-day trial`;
  return "Subscribe";
}

/**
 * Client-safe mirror of getOrgPlanById's rule: a built-in tier slug maps to its
 * own tier; any custom admin-created slug gets ENTERPRISE-level boolean features
 * (its numeric quotas come from the plan's own limits via the Limits engine).
 */
export function featureTierForSlug(slug: string): Plan {
  const upper = slug.toUpperCase();
  return (PLAN_TIERS as readonly string[]).includes(upper) ? (upper as Plan) : "ENTERPRISE";
}

/** Single home for the built-in tier display labels. */
export function labelForTier(tier: Plan | string | null | undefined): string {
  switch (tier) {
    case "STARTER":
      return "Starter";
    case "PROFESSIONAL":
      return "Professional";
    case "ENTERPRISE":
      return "Enterprise";
    default:
      // No-subscription orgs have no tier to name (the Free tier is gone).
      return tier ? titleCaseSlug(tier) : "—";
  }
}

/** Display fallback for a subscription pointing at a slug no longer in the catalog. */
export function titleCaseSlug(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
