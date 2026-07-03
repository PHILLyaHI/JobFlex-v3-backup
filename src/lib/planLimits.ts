// Pure, client-safe definitions for per-plan numeric limits.
//
// NO server imports here (no Prisma, no "use server"). Both the admin Plans UI
// (client) and the server-side Limits Engine (src/lib/entitlements.ts) import
// these so the limit keys, scopes, and (de)serialization stay in one place.
//
// Storage: PricingPlan.limitsJson holds a JSON object keyed by LimitKey. A key
// that is absent, null, or negative means "unlimited".

export const UNLIMITED = -1;

/**
 * Stable error message thrown by enforcePlanLimit and detected on the client to
 * raise the "limit reached" dialog. Kept here (client-safe) so both sides agree.
 */
export const PLAN_LIMIT_MESSAGE = "Plan limit reached";

export function isPlanLimitError(err: unknown): boolean {
  return err instanceof Error && err.message === PLAN_LIMIT_MESSAGE;
}

/** How a limit's usage window is computed. */
export type LimitScope =
  | "monthly" // counted within the current billing cycle
  | "absolute"; // counted across the org's whole lifetime

export type LimitKey =
  | "proposalsCreated"
  | "proposalsAccepted"
  | "proposalsCompleted"
  | "calendarCards"
  | "calendarEvents"
  | "projects"
  | "jobs"
  | "workers"
  | "estimatorUses";

export interface LimitDef {
  key: LimitKey;
  label: string;
  scope: LimitScope;
  hint: string;
}

// The order here is the order shown in the admin "Plan Limits" section.
// `scope` is the single source of truth the engine uses to decide whether a
// usage count is windowed to the billing cycle (monthly) or counted in full
// (absolute). Flip a `scope` here and the engine follows automatically.
export const LIMIT_DEFS: readonly LimitDef[] = [
  { key: "proposalsCreated", label: "Proposals created", scope: "monthly", hint: "New proposals per billing cycle" },
  { key: "proposalsAccepted", label: "Proposals accepted", scope: "monthly", hint: "Accepted per billing cycle" },
  { key: "proposalsCompleted", label: "Proposals completed", scope: "monthly", hint: "Completed/paid per billing cycle" },
  { key: "calendarCards", label: "Calendar cards", scope: "monthly", hint: "Appointments scheduled per cycle" },
  { key: "calendarEvents", label: "Calendar events", scope: "monthly", hint: "Job events scheduled per cycle" },
  { key: "projects", label: "Total projects", scope: "monthly", hint: "New projects per billing cycle" },
  { key: "jobs", label: "Total jobs", scope: "monthly", hint: "New jobs per billing cycle" },
  { key: "workers", label: "Total workers", scope: "absolute", hint: "Worker seats in the org (lifetime)" },
  { key: "estimatorUses", label: "Estimator uses", scope: "monthly", hint: "AI estimator runs per cycle" },
] as const;

export const LIMIT_KEYS = LIMIT_DEFS.map((d) => d.key) as LimitKey[];

export type PlanLimits = Partial<Record<LimitKey, number>>;

/** A limit is "unlimited" when missing, null, or negative (e.g. the -1 sentinel). */
export function isUnlimited(v: number | null | undefined): boolean {
  return v === null || v === undefined || !Number.isFinite(v) || v < 0;
}

/** Parse PricingPlan.limitsJson into a typed, validated PlanLimits object. */
export function parsePlanLimits(json: string | null | undefined): PlanLimits {
  if (!json) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object") return {};
  const rec = raw as Record<string, unknown>;
  const out: PlanLimits = {};
  for (const def of LIMIT_DEFS) {
    const v = rec[def.key];
    if (typeof v === "number" && Number.isFinite(v)) out[def.key] = Math.trunc(v);
  }
  return out;
}

/**
 * Serialize a PlanLimits-like object for storage. Only known keys with a
 * finite, non-negative cap are persisted; unlimited values are simply omitted
 * (absent key === unlimited on read), keeping the JSON small and intentional.
 */
export function serializePlanLimits(limits: Record<string, number | null | undefined>): string {
  const out: Record<string, number> = {};
  for (const def of LIMIT_DEFS) {
    const v = limits[def.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[def.key] = Math.trunc(v);
  }
  return JSON.stringify(out);
}
