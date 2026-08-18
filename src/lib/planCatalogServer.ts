// Server-only plan-catalog fetchers (imports Prisma — never import from client
// components; the client-safe DTO + helpers live in planCatalog.ts).
//
// PricingPlan rows are the single source of truth for every plan surface.
// Matching against Subscription.plan is case-insensitive in JS because stored
// plan values are uppercase ("STARTER") while slugs are lowercase, and SQLite
// has no case-insensitive query mode (same rationale as limitsEngine.ts).

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLAN_TIERS, type Plan } from "@/lib/entitlements";
import { parsePlanLimits } from "@/lib/planLimits";
import type { PlanDTO } from "@/lib/planCatalog";

/** Canonical parser for the PricingPlan.features JSON column. */
export function parseFeatures(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

type PricingPlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number;
  yearlyPriceCents: number | null;
  trialDays: number;
  order: number;
  features: string;
  limitsJson: string | null;
  active: boolean;
  highlight: boolean;
};

function toPlanDTO(row: PricingPlanRow): PlanDTO {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    priceCents: row.priceCents,
    yearlyPriceCents: row.yearlyPriceCents,
    trialDays: row.trialDays,
    order: row.order,
    features: parseFeatures(row.features),
    limits: parsePlanLimits(row.limitsJson),
    active: row.active,
    highlight: row.highlight,
    isFree: row.priceCents === 0,
  };
}

/** All plans, display-ordered. Inactive plans are hidden unless asked for. */
export async function getPlanCatalog(opts?: { includeInactive?: boolean }): Promise<PlanDTO[]> {
  const rows = await db.pricingPlan.findMany({
    where: opts?.includeInactive ? {} : { active: true },
    orderBy: { order: "asc" },
  });
  return rows.map(toPlanDTO);
}

/** Case-insensitive slug lookup (accepts "starter", "STARTER", …). */
export async function getPlanBySlug(
  slug: string,
  opts?: { includeInactive?: boolean },
): Promise<PlanDTO | null> {
  const s = slug.trim();
  if (!s) return null;
  const row = await db.pricingPlan.findFirst({
    where: {
      slug: { in: [s, s.toLowerCase(), s.toUpperCase()] },
      ...(opts?.includeInactive ? {} : { active: true }),
    },
  });
  return row ? toPlanDTO(row) : null;
}

/**
 * { FREE: 0, STARTER: 2900, ... } built from ALL rows (including inactive —
 * grandfathered subscribers still count toward MRR at their plan's list price).
 */
export async function getMonthlyCentsBySlugUpper(): Promise<Record<string, number>> {
  const rows = await db.pricingPlan.findMany({ select: { slug: true, priceCents: true } });
  return Object.fromEntries(rows.map((r) => [r.slug.toUpperCase(), r.priceCents]));
}

/**
 * Purge every surface that renders plan data. Lives here (not in a "use server"
 * file) because action modules may only export async functions — and every such
 * export becomes a public RPC endpoint. Called by the plan admin actions.
 */
export function revalidatePlanSurfaces(): void {
  for (const p of [
    "/admin/plans",
    "/pricing",
    "/dashboard/subscription",
    "/dashboard/subscription-blueprint",
    "/dashboard/settings/account",
    "/v3/company/subscription",
  ]) {
    revalidatePath(p);
  }
}

/**
 * Resolve an org's plan for display + gating in one call.
 * - `tier`: boolean-feature tier — built-in slug → itself; custom slug that still
 *   exists in the catalog → ENTERPRISE (full features; quotas come from the plan's
 *   own limits); anything else → FREE. Mirrors orgPlan.getOrgPlanById.
 * - `plan`: the catalog DTO, matched INCLUDING inactive plans on purpose —
 *   grandfathered subscribers keep seeing (and using) a deactivated plan.
 * - `rawPlan`: Subscription.plan exactly as stored (e.g. "STARTER").
 */
export async function getOrgPlanContext(organizationId: string): Promise<{
  tier: Plan;
  plan: PlanDTO | null;
  rawPlan: string;
}> {
  const sub = await db.subscription.findUnique({
    where: { organizationId },
    select: { plan: true },
  });
  const rawPlan = sub?.plan ?? "FREE";
  const plan = await getPlanBySlug(rawPlan, { includeInactive: true });
  const upper = rawPlan.toUpperCase();
  const tier: Plan = (PLAN_TIERS as readonly string[]).includes(upper)
    ? (upper as Plan)
    : plan
      ? "ENTERPRISE"
      : "FREE";
  return { tier, plan, rawPlan };
}
