export type TrafficAudience = "all" | "new" | "returning";
export type TrafficEnvironment = "all" | "production" | "development";
export interface TrafficFilters {
  from: string;
  to: string;
  timezone: string;
  audience: TrafficAudience;
  environment: TrafficEnvironment;
  page: string;
  source: string;
  device: string;
  host: string;
  flow: "standard" | "google";
  windowDays: number;
  billingMode: "live" | "test" | "all";
}
export interface TrafficTotals {
  visitors: number;
  newVisitors: number;
  returningVisitors: number;
  repeatVisitors: number;
  sessions: number;
  pageviews: number;
}
export interface TrafficPoint extends TrafficTotals { date: string }
export interface TrafficPage extends TrafficTotals { page: string }
export interface TrafficBreakdown { name: string; visitors: number; sessions: number; conversions: number }
export interface FunnelStage { id: string; label: string; visitors: number }
export interface ExperimentResult {
  experiment: string;
  variant: string;
  visitors: number;
  attempts: number;
  completed: number;
  mixedVisitors: number;
}
export interface StageVisitor {
  id: string;
  reachedAt: string;
  lastSeen: string;
  device: string;
  browser: string;
  os: string;
  country: string;
  region: string;
  city: string;
  source: string;
  referrer: string;
  campaign: string;
  sessions: number;
  views: number;
  furthest: string;
  personUrl: string | null;
}
export interface StageVisitorsReport {
  stage: { id: string; label: string };
  filters: TrafficFilters;
  total: number;
  visitors: StageVisitor[];
  fetchedAt: string;
}
export interface TrafficReport {
  filters: TrafficFilters;
  fetchedAt: string;
  status: "ok" | "disabled" | "error";
  message?: string;
  errors: string[];
  totals: TrafficTotals | null;
  previous: TrafficTotals | null;
  lifetime: number | null;
  today: number | null;
  firstTrackedAt: string | null;
  firstStepAt: string | null;
  points: TrafficPoint[];
  pages: TrafficPage[];
  sources: TrafficBreakdown[];
  referrers: TrafficBreakdown[];
  campaigns: TrafficBreakdown[];
  devices: TrafficBreakdown[];
  browsers: TrafficBreakdown[];
  countries: TrafficBreakdown[];
  terms: TrafficBreakdown[];
  hosts: TrafficBreakdown[];
  funnel: FunnelStage[];
  funnelOutcomes: { trials: number; purchases: number; other: number; trialAttempts: number; purchaseAttempts: number } | null;
  experiments: ExperimentResult[];
}

export const TRAFFIC_EVENTS = {
  step: "jf_registration_step_viewed",
  attempt: "jf_checkout_attempted",
  opened: "jf_checkout_opened",
  completed: "jf_signup_completed",
  error: "jf_registration_error",
  exposure: "jf_experiment_exposed",
} as const;

export function pageLabel(page: string): string {
  const labels: Record<string, string> = {
    "/": "Landing page", "/auth/login": "Login", "/auth/register": "Registration entry",
    "registration:1": "Step 1 / Account", "registration:2": "Step 2 / Company", "registration:3": "Step 3 / Plan",
  };
  return labels[page] ?? page;
}

export function percent(value: number, total: number): number | null {
  return total > 0 ? value / total * 100 : null;
}

/** Wilson interval: uncertainty for a conversion rate, not a significance verdict. */
export function conversionInterval(converted: number, exposed: number): [number, number] | null {
  if (!exposed) return null;
  const p = converted / exposed;
  const z2 = 1.96 ** 2;
  const center = p + z2 / (2 * exposed);
  const spread = 1.96 * Math.sqrt(p * (1 - p) / exposed + z2 / (4 * exposed ** 2));
  return [(center - spread) / (1 + z2 / exposed) * 100, (center + spread) / (1 + z2 / exposed) * 100];
}
