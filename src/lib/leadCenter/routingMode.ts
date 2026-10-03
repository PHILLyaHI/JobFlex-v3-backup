// How a new homeowner request is routed: by the cascade, or by an admin.
//
//   MANUAL — nothing is offered. The request parks in the Lead Center queue and
//            an admin decides who gets it. THE DEFAULT since 2026-10-03 (owner):
//            every real lead is placed by hand, and the cascade runs on no path
//            at all — not the intake, not the cron, not a pass, not a lapse, not
//            the homeowner's "find me another contractor".
//   AUTO   — the moment a request lands it is ranked and offered to the best
//            matching shop, then the next, then the next (24h each, 3 attempts).
//            The behaviour the platform shipped with; one switch away, for NEW
//            requests only — leads already in the queue stay there.
//
// WHERE IT IS STORED. `SyncState` is the app's existing key→string table (a
// cursor store for sync jobs); a platform-wide switch is the same shape — one
// key, one small value, read on the routing path and written from one admin
// control. Using it keeps this a code change rather than a migration, which is
// the difference between shipping the switch and waiting on one.
import { db } from "@/lib/db";

export type RoutingMode = "AUTO" | "MANUAL";

// A NEW key on 2026-10-03. The old `leadCenter:routingMode` row may hold
// "AUTO" on production (the switch was there, and the cascade was running), and
// the owner's decision is that a deploy turns the cascade off with nothing to
// click — so the old row is simply no longer read. Only an admin flipping the
// switch after this writes here.
const KEY = "leadCenter:routingMode:v2";

/** MANUAL unless an admin has switched to AUTO. A store that cannot be read
 *  also reads MANUAL: the safe failure is a lead waiting for a person, not a
 *  lead offered to a shop nobody chose. */
export async function getRoutingMode(): Promise<RoutingMode> {
  try {
    const row = await db.syncState.findUnique({ where: { key: KEY } });
    return row?.cursor === "AUTO" ? "AUTO" : "MANUAL";
  } catch {
    return "MANUAL";
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

/** `queueReason` for a lead an admin had placed that came back — the shop
 *  passed, its 24 hours ran out, or the homeowner asked for another — while the
 *  platform routes automatically: it returns to the admin, not to the cascade. */
export const RETURNED_REASON = "RETURNED";
