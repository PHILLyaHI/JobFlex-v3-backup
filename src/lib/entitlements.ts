// Plan-based feature gating. Derived at runtime from Subscription.plan — no DB table needed.

export const PLAN_TIERS = ["FREE", "STARTER", "PROFESSIONAL", "ENTERPRISE"] as const;
export type Plan = (typeof PLAN_TIERS)[number];

export const ALL_FEATURES = [
  "unlimited_proposals",
  "ai_proposals",
  "advanced_estimator",
  "proposal_templates",
  "pdf_export",
  "follow_ups",
  "sms_notifications",
  "csv_export",
  "multi_org",
  "custom_domain",
  "white_label",
] as const;
export type Feature = (typeof ALL_FEATURES)[number];

export const FEATURE_LABELS: Record<Feature, string> = {
  unlimited_proposals: "Unlimited proposals",
  ai_proposals: "AI proposal drafts",
  advanced_estimator: "Advanced AI estimator",
  proposal_templates: "Proposal templates",
  pdf_export: "Branded PDF export",
  follow_ups: "Follow-up automation",
  sms_notifications: "SMS notifications",
  csv_export: "CSV report exports",
  multi_org: "Multiple organizations",
  custom_domain: "Custom domain",
  white_label: "White-label client portal",
};

// Minimum plan that unlocks each feature.
export const MINIMUM_PLAN_FOR: Record<Feature, Plan> = {
  unlimited_proposals: "PROFESSIONAL",
  ai_proposals: "PROFESSIONAL",
  advanced_estimator: "PROFESSIONAL",
  proposal_templates: "PROFESSIONAL",
  pdf_export: "STARTER",
  follow_ups: "PROFESSIONAL",
  sms_notifications: "ENTERPRISE",
  csv_export: "PROFESSIONAL",
  multi_org: "ENTERPRISE",
  custom_domain: "ENTERPRISE",
  white_label: "ENTERPRISE",
};

const RANK: Record<Plan, number> = {
  FREE: 0,
  STARTER: 1,
  PROFESSIONAL: 2,
  ENTERPRISE: 3,
};

export function hasFeature(plan: Plan | string | null | undefined, feature: Feature): boolean {
  const p = (plan as Plan) ?? "FREE";
  const required = MINIMUM_PLAN_FOR[feature];
  return (RANK[p] ?? 0) >= RANK[required];
}

export function requireFeatureOrThrow(plan: Plan | string | null | undefined, feature: Feature) {
  if (!hasFeature(plan, feature)) {
    const err = new Error(
      `${FEATURE_LABELS[feature]} requires the ${MINIMUM_PLAN_FOR[feature]} plan.`,
    );
    (err as any).code = "FEATURE_GATED";
    (err as any).feature = feature;
    (err as any).requiredPlan = MINIMUM_PLAN_FOR[feature];
    throw err;
  }
}

export function getOrgPlan(subscription: { plan?: string | null } | null | undefined): Plan {
  const p = (subscription?.plan as Plan) ?? "FREE";
  return PLAN_TIERS.includes(p) ? p : "FREE";
}
