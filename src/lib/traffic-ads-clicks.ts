// ADS MANAGER CLICKS, KEPT FOR EVERY ADMIN (2026-10-04). The link clicks Ads
// Manager reports for a day, typed into the reconciliation table, were kept
// in one browser's localStorage; now one SyncState row per day,
// `adsclicks:<YYYY-MM-DD>` (Los Angeles day), the number as text. Server only.

import { db } from "./db";

export const adsClicksKey = (day: string) => `adsclicks:${day}`;
export const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
/** A day's clicks: a whole number up to seven digits, or null to forget the day. */
export function clicksValue(v: unknown): number | null | undefined {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 0 && n <= 9_999_999 ? n : undefined;
}

export async function readAdsClicks(days: readonly string[]): Promise<Record<string, number>> {
  const wanted = [...new Set(days.filter(isDay))].slice(0, 400);
  if (!wanted.length) return {};
  const rows = await db.syncState.findMany({ where: { key: { in: wanted.map(adsClicksKey) } }, select: { key: true, cursor: true } });
  const out: Record<string, number> = {};
  for (const r of rows) { const n = Number(r.cursor); if (Number.isFinite(n)) out[r.key.slice("adsclicks:".length)] = n; }
  return out;
}

/** Writes the given days (null forgets one). Returns the days written. */
export async function writeAdsClicks(entries: Record<string, number | null>): Promise<string[]> {
  const days = Object.keys(entries).filter(isDay).slice(0, 400);
  for (const day of days) {
    const v = entries[day];
    if (v === null) await db.syncState.deleteMany({ where: { key: adsClicksKey(day) } });
    else await db.syncState.upsert({ where: { key: adsClicksKey(day) }, create: { key: adsClicksKey(day), cursor: String(v) }, update: { cursor: String(v) } });
  }
  return days;
}
