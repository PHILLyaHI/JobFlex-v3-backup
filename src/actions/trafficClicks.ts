"use server";

// The reconciliation table's Ads Manager clicks, kept in SyncState for every
// admin (lib/traffic-ads-clicks, 2026-10-04). Platform admins only.

import { requirePlatformAdmin } from "@/lib/orgContext";
import { clicksValue, isDay, readAdsClicks, writeAdsClicks } from "@/lib/traffic-ads-clicks";

export async function getAdsManagerClicks(input: { days?: unknown } = {}): Promise<Record<string, number>> {
  await requirePlatformAdmin();
  const days = Array.isArray(input.days) ? input.days.filter(isDay) : [];
  return readAdsClicks(days);
}

export async function saveAdsManagerClicks(input: { entries?: unknown } = {}): Promise<{ ok: boolean; saved: string[]; error?: string }> {
  await requirePlatformAdmin();
  const raw = input.entries && typeof input.entries === "object" ? (input.entries as Record<string, unknown>) : {};
  const entries: Record<string, number | null> = {};
  for (const [day, v] of Object.entries(raw)) {
    const value = clicksValue(v);
    if (isDay(day) && value !== undefined) entries[day] = value;
  }
  if (!Object.keys(entries).length) return { ok: false, saved: [], error: "Nothing to save: a day and a whole number of clicks." };
  try { return { ok: true, saved: await writeAdsClicks(entries) }; }
  catch { return { ok: false, saved: [], error: "The clicks could not be saved. Try again." }; }
}
