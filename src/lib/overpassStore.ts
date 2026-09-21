// OpenStreetMap context (house footprints + street centrelines) for a point:
// what is remembered, and the log the Integrations health row is read from.
//
// Both live in SyncState (key → string), beside the parcel cache rather than in
// it: additive, no schema change, and the same table the quota and limiter
// state already use.
//
//   · `osm:pt:<lat>,<lng>` — the parsed answer for a point, rounded to 5
//     decimals (~1 m: the same address geocodes to the same point). Kept as
//     long as the parcel is — ParcelCache rows do not expire, so these do not
//     either. Only a real answer is stored, including a real "no buildings
//     here"; a dead lookup is never remembered as "nothing".
//   · `overpass:log:<YYYY-MM-DDTHH>` — "ok,failed,viaFallback" per hour. The
//     health row sums the last 24 of them; nothing is ever called to find out.
//
// The contractor's manual shift of an outline is NOT here: it is the browser's
// (per address) and is applied on top of whatever this returns.
import { db } from "@/lib/db";

const POINT_PREFIX = "osm:pt:";
export const OVERPASS_LOG_PREFIX = "overpass:log:";
const HOUR_MS = 60 * 60 * 1000;

const pointKey = (lat: number, lng: number) => `${POINT_PREFIX}${lat.toFixed(5)},${lng.toFixed(5)}`;
const hourKey = (d: Date) => `${OVERPASS_LOG_PREFIX}${d.toISOString().slice(0, 13)}`;

export async function readOsmPoint<T>(lat: number, lng: number): Promise<T | null> {
  try {
    const row = await db.syncState.findUnique({ where: { key: pointKey(lat, lng) } });
    if (!row) return null;
    const parsed = JSON.parse(row.cursor) as { v?: number; data?: T };
    return parsed.v === 1 && parsed.data ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function writeOsmPoint<T>(lat: number, lng: number, data: T): Promise<void> {
  const cursor = JSON.stringify({ v: 1, at: new Date().toISOString(), data });
  await db.syncState
    .upsert({ where: { key: pointKey(lat, lng) }, update: { cursor }, create: { key: pointKey(lat, lng), cursor } })
    .catch(() => {});
}

/** One lookup's outcome. Best-effort: a log that cannot be written never fails a lookup. */
export async function recordOverpass(outcome: "ok" | "ok-fallback" | "failed"): Promise<void> {
  try {
    const key = hourKey(new Date());
    const row = await db.syncState.findUnique({ where: { key } });
    const [ok = 0, failed = 0, viaFallback = 0] = (row?.cursor ?? "").split(",").map((n) => Number(n) || 0);
    const cursor = [
      ok + (outcome === "failed" ? 0 : 1),
      failed + (outcome === "failed" ? 1 : 0),
      viaFallback + (outcome === "ok-fallback" ? 1 : 0),
    ].join(",");
    await db.syncState.upsert({ where: { key }, update: { cursor }, create: { key, cursor } });
    // Hours older than two days are of no use to a 24-hour figure.
    if (!row) {
      await db.syncState.deleteMany({
        where: { key: { startsWith: OVERPASS_LOG_PREFIX }, updatedAt: { lt: new Date(Date.now() - 48 * HOUR_MS) } },
      });
    }
  } catch {
    /* the log is a courtesy */
  }
}

export async function readOverpassDay(): Promise<{ ok: number; failed: number; viaFallback: number; lastAt: Date | null }> {
  const now = Date.now();
  const keys = Array.from({ length: 24 }, (_, i) => hourKey(new Date(now - i * HOUR_MS)));
  const rows = await db.syncState.findMany({ where: { key: { in: keys } } });
  let ok = 0, failed = 0, viaFallback = 0;
  let lastAt: Date | null = null;
  for (const r of rows) {
    const [a = 0, b = 0, c = 0] = r.cursor.split(",").map((n) => Number(n) || 0);
    ok += a; failed += b; viaFallback += c;
    if (!lastAt || r.updatedAt > lastAt) lastAt = r.updatedAt;
  }
  return { ok, failed, viaFallback, lastAt };
}
