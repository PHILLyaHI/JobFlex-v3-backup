// Flags, constants and the deterministic id builders for the legacy import.
//
// Every id is derived, never random: an old row keeps its own id, and a row we
// synthesise gets a stable id built from the ids it came from. That is what makes
// the whole tool idempotent — a re-run upserts the same rows instead of creating
// duplicates — and what lets --rollback delete exactly what we wrote.

export interface Flags {
  /** Empty when --all-active-paid selects the cohort instead. */
  email: string;
  allActivePaid: boolean;
  includeTrialing: boolean;
  includeInternal: boolean;
  target: "local" | "prod";
  dryRun: boolean;
  phase: string;
  rollback: boolean;
  mergeIntoExisting: boolean;
  keepExistingPassword: boolean;
  localTestPassword: string | null;
  forceRefresh: boolean;
}

function flagValue(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export function parseFlags(): Flags {
  const allActivePaid = hasFlag("all-active-paid");
  const email = (flagValue("email") ?? "").trim().toLowerCase();
  if (!email && !allActivePaid) throw new Error("--email <old account email> or --all-active-paid is required");
  const target = (flagValue("target") ?? "local") as "local" | "prod";
  if (target !== "local" && target !== "prod") throw new Error("--target must be local or prod");
  return {
    email,
    allActivePaid,
    includeTrialing: hasFlag("include-trialing"),
    includeInternal: hasFlag("include-internal"),
    target,
    dryRun: hasFlag("dry-run"),
    phase: flagValue("phase") ?? "all",
    rollback: hasFlag("rollback"),
    mergeIntoExisting: hasFlag("merge-into-existing"),
    keepExistingPassword: hasFlag("keep-existing-password"),
    localTestPassword: flagValue("local-test-password"),
    forceRefresh: hasFlag("force-refresh"),
  };
}

// ── deterministic ids ──
export const orgId = (oldUserId: string) => `org_${oldUserId}`;
export const membershipId = (org: string, user: string) => `mem_${org}_${user}`;
export const subscriptionId = (org: string) => `sub_${org}`;
export const accountId = (providerAccountId: string) => `acct_${providerAccountId}`;
export const lineItemId = (quoteId: string, n: number) => `li_${quoteId}_${n}`;
export const discountId = (quoteId: string) => `disc_${quoteId}`;
export const snapshotId = (quoteId: string) => `snap_${quoteId}`;
export const installmentId = (quoteId: string, n: number) => `inst_${quoteId}_${n}`;
export const jobId = (quoteId: string) => `job_${quoteId}`;
export const participantId = (convId: string, userId: string) => `cp_${convId}_${userId}`;
export const legacyApptId = (leadApptId: string) => `appt_la_${leadApptId}`;
export const activityId = (quoteId: string) => `act_accepted_${quoteId}`;
/**
 * A client that this account's quotes reference but that belongs to someone else
 * gets its own per-organisation copy. Reusing the original id would put one row
 * in whichever org imported first and leave the other org's proposals pointing at
 * a client it cannot see — the exact cross-tenant leak the org scoping exists to
 * prevent.
 */
export const foreignClientId = (organizationId: string, clientId: string) =>
  `xc_${organizationId.slice(-8)}_${clientId}`;

/** SyncState keys — the manifest and the per-phase checkpoints. */
export const manifestKey = (oldUserId: string) => `migrate:v2:${oldUserId}`;
/** The PlanPrice rows the batch seeded for the old Stripe prices. */
export const ledgerKey = () => "migrate:v2:ledger";

/**
 * The operator's own accounts in the old app. They carry a paid tier (comped)
 * and a great deal of test data, and are not customers; skipped by the batch
 * unless --include-internal is passed.
 */
export const INTERNAL_ACCOUNTS = new Set(["admin@jobflex.app", "test@jobflex.app"]);
export const checkpointKey = (oldUserId: string, phase: string) => `migrate:v2:${oldUserId}:${phase}`;

/**
 * Transactions get a real timeout: the 5s default cannot survive a large customer.
 * The biggest account in this data is ~5,300 round trips (every write is preceded
 * by an existence check), which is seconds on local SQLite but minutes against
 * Neon once network latency is in the loop.
 */
export const TX = { timeout: 900_000, maxWait: 30_000 } as const;

/** Thrown at the end of a --dry-run transaction so every write rolls back. */
export class RollbackSignal extends Error {
  constructor() {
    super("dry-run rollback");
    this.name = "RollbackSignal";
  }
}
