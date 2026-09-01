// How a new homeowner request is routed: by the cascade, or by an admin.
//
//   AUTO   — the moment a request lands it is ranked and offered to the best
//            matching shop, then the next, then the next (24h each, 3 attempts).
//            This is the behaviour the platform shipped with.
//   MANUAL — nothing is offered. The request parks in the Lead Center queue and
//            an admin decides who gets it, one at a time or all at once.
//
// WHERE IT IS STORED. `SyncState` is the app's existing key→string table (a
// cursor store for sync jobs); a platform-wide switch is the same shape — one
// key, one small value, read on the routing path and written from one admin
// control. Using it keeps this a code change rather than a migration, which is
// the difference between shipping the switch and waiting on one.
import { db } from "@/lib/db";

export type RoutingMode = "AUTO" | "MANUAL";

const KEY = "leadCenter:routingMode";

/** AUTO unless an admin has said otherwise — a store that cannot be read must
 *  not silently stop routing leads. */
export async function getRoutingMode(): Promise<RoutingMode> {
  try {
    const row = await db.syncState.findUnique({ where: { key: KEY } });
    return row?.cursor === "MANUAL" ? "MANUAL" : "AUTO";
  } catch {
    return "AUTO";
  }
}

export async function setRoutingMode(mode: RoutingMode): Promise<void> {
  await db.syncState.upsert({
    where: { key: KEY },
    update: { cursor: mode },
    create: { key: KEY, cursor: mode },
  });
}

/** `queueReason` for a lead parked because the platform is in manual mode —
 *  distinct from NO_CANDIDATES (nobody covers it) and EXHAUSTED (three shops
 *  passed), because the fix for it is different. */
export const MANUAL_MODE_REASON = "MANUAL_MODE";
