// THE ADMIN'S USAGE RESET — the logic behind actions/adminUsage (owner,
// 2026-09-22). Here, not in the action file, so the QA harness can drive it
// through the real code with an explicit actor.
//
// WHAT A RESET IS. The limits engine keeps no counters: it counts the rows an
// organization made since its cycle start (lib/limitsEngine, "THERE ARE NO
// COUNTERS"). A reset deletes nothing and changes no cap — it writes a
// SyncState mark `usageResetAt:<orgId>:<key>` with the time, the author and
// a reason, and from then on the engine counts only the rows made after the
// mark. The mark is over by itself when the next cycle begins (the engine
// ignores a mark before the cycle start), so nothing has to be cleaned up.
// A second reset simply writes a newer mark over the first.
//
// ONLY MONTHLY KEYS. Seats — workers, clients, team seats, manager seats —
// are live counts, not usage within a cycle; resetting one would let an
// organization hold seats past its cap for good. They are listed but cannot
// be reset.
//
// No schema change: the same store the plan grant and the syncing mark use.

import { db } from "@/lib/db";
import { ActivityKind } from "@/lib/prismaEnums";
import {
  getOrgLimitUsage,
  getOrgCycleStart,
  readUsageResetMarks,
  usageResetInForce,
  usageResetKey,
  type LimitStatus,
  type UsageResetMark,
} from "@/lib/limitsEngine";
import { LIMIT_DEFS, type LimitKey, type LimitScope } from "@/lib/planLimits";

/** Who is resetting — the platform admin behind the action. */
export interface ResetActor {
  id: string;
  email: string;
}

export const RESETTABLE_KEYS: readonly LimitKey[] = LIMIT_DEFS.filter((d) => d.scope === "monthly").map((d) => d.key);
const KEY_SET = new Set<string>(LIMIT_DEFS.map((d) => d.key));
const RESETTABLE_SET = new Set<string>(RESETTABLE_KEYS);
const MIN_REASON = 3;

/* ── What the admin sees ───────────────────────────────────────────────── */

export interface AdminUsageRow {
  key: LimitKey;
  label: string;
  scope: LimitScope;
  used: number;
  /** null = no cap on this plan. */
  limit: number | null;
  /** The mark the count starts from this cycle, if any. */
  reset: { at: string; actorEmail: string; reason: string; before: { used: number; limit: number | null } } | null;
  /** False for seats: a live count has nothing to reset. */
  resettable: boolean;
}

export interface AdminUsage {
  cycleStart: string;
  rows: AdminUsageRow[];
}

/** The organization's meters this cycle, with the marks in force. */
export async function orgUsageForAdmin(organizationId: string): Promise<AdminUsage> {
  const [usage, cycleStart, marks] = await Promise.all([
    getOrgLimitUsage(organizationId),
    getOrgCycleStart(organizationId),
    readUsageResetMarks(organizationId),
  ]);
  const byKey = new Map<LimitKey, LimitStatus>(usage.map((u) => [u.resource, u]));
  const rows: AdminUsageRow[] = LIMIT_DEFS.map((d) => {
    const u = byKey.get(d.key);
    const mark = marks[d.key];
    const inForce = d.scope === "monthly" && usageResetInForce(mark, cycleStart) && mark ? mark : null;
    return {
      key: d.key,
      label: d.label,
      scope: d.scope,
      used: u?.used ?? 0,
      limit: u?.limit ?? null,
      reset: inForce ? { at: inForce.at, actorEmail: inForce.actorEmail, reason: inForce.reason, before: inForce.before } : null,
      resettable: d.scope === "monthly",
    };
  });
  return { cycleStart: cycleStart.toISOString(), rows };
}

/* ── The reset itself ──────────────────────────────────────────────────── */

export interface UsageResetInput {
  organizationId: string;
  /** The keys to reset, or "all" for every monthly key. */
  keys: LimitKey[] | "all";
  reason: string;
}

export interface UsageResetDone {
  key: LimitKey;
  label: string;
  before: { used: number; limit: number | null };
}

export type UsageResetResult = { ok: true; at: string; done: UsageResetDone[]; summary: string } | { ok: false; error: string };

function parseInput(raw: unknown): UsageResetInput | string {
  if (!raw || typeof raw !== "object") return "Bad input.";
  const r = raw as Record<string, unknown>;
  if (typeof r.organizationId !== "string" || !r.organizationId) return "Which organization?";
  if (typeof r.reason !== "string") return "Give a reason.";
  let keys: LimitKey[] | "all";
  if (r.keys === "all") keys = "all";
  else if (Array.isArray(r.keys) && r.keys.length && r.keys.every((k) => typeof k === "string")) {
    for (const k of r.keys as string[]) {
      if (!KEY_SET.has(k)) return `Unknown limit "${k}".`;
      if (!RESETTABLE_SET.has(k)) return `${LIMIT_DEFS.find((d) => d.key === k)?.label ?? k} is a seat count, not usage — it cannot be reset.`;
    }
    keys = [...new Set(r.keys as LimitKey[])];
  } else return "Which limits?";
  return { organizationId: r.organizationId, keys, reason: r.reason };
}

/**
 * Write the marks. Reads the meters first so the record says what each one
 * showed; the activity event carries the same. Refuses without a reason,
 * for a seat key, and for an organization that does not exist.
 */
export async function resetOrgUsage(raw: unknown, actor: ResetActor): Promise<UsageResetResult> {
  const input = parseInput(raw);
  if (typeof input === "string") return { ok: false, error: input };
  const reason = input.reason.trim();
  if (reason.length < MIN_REASON) return { ok: false, error: "Give a reason." };

  const org = await db.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, name: true } });
  if (!org) return { ok: false, error: "No such organization." };

  const keys = input.keys === "all" ? [...RESETTABLE_KEYS] : input.keys;
  const [usage, cycleStart] = await Promise.all([getOrgLimitUsage(org.id), getOrgCycleStart(org.id)]);
  const byKey = new Map<LimitKey, LimitStatus>(usage.map((u) => [u.resource, u]));
  const at = new Date();

  const done: UsageResetDone[] = [];
  for (const key of keys) {
    const def = LIMIT_DEFS.find((d) => d.key === key)!;
    const u = byKey.get(key);
    const before = { used: u?.used ?? 0, limit: u?.limit ?? null };
    const mark: UsageResetMark = {
      at: at.toISOString(),
      cycleStart: cycleStart.toISOString(),
      actorId: actor.id,
      actorEmail: actor.email,
      reason,
      before,
    };
    const cursor = JSON.stringify(mark);
    const k = usageResetKey(org.id, key);
    await db.syncState.upsert({ where: { key: k }, update: { cursor }, create: { key: k, cursor } });
    done.push({ key, label: def.label, before });
  }

  const parts = done.map((d) => `${d.label} (${d.before.used} → 0${d.before.limit === null ? "" : ` of ${d.before.limit}`})`);
  const summary =
    done.length === RESETTABLE_KEYS.length
      ? `Usage reset by JobFlex support — every limit this cycle`
      : `Usage reset by JobFlex support — ${parts.join(", ")}`;
  await db.activityEvent
    .create({
      data: {
        organizationId: org.id,
        actorId: actor.id,
        kind: ActivityKind.USAGE_RESET,
        summary,
        meta: JSON.stringify({ at: at.toISOString(), cycleStart: cycleStart.toISOString(), reason, actorEmail: actor.email, keys: done }),
      },
    })
    .catch((err) => console.warn("[usageReset] activity event failed:", err));

  return { ok: true, at: at.toISOString(), done, summary };
}
