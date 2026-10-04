"use server";

// The analyst's history on the Traffic page (2026-10-04): the fourteen-day
// trend, the history as JSON, and the switch for the daily email
// (lib/traffic-digest saves one reading a day). Platform admins only.

import { requirePlatformAdmin } from "@/lib/orgContext";
import { digestEmailOn, digestRecipients, readSnapshots, setDigestEmail } from "@/lib/traffic-digest";
import { TREND_DAYS, trendDays, trendOf, type AnalystSnapshot, type AnalystTrend } from "@/lib/traffic-history";
import { dateInZone } from "@/lib/traffic-query";
import { TRAFFIC_TZ } from "@/lib/traffic-visitor";

export interface DigestSettings { emailOn: boolean; recipients: string[]; lastSentAt: string | null; lastDay: string | null }
export interface AnalystHistory { trend: AnalystTrend; digest: DigestSettings }

const today = () => dateInZone(new Date(), TRAFFIC_TZ);

async function settings(snapshots: AnalystSnapshot[]): Promise<DigestSettings> {
  const last = [...snapshots].sort((a, b) => b.day.localeCompare(a.day))[0] ?? null;
  const sent = [...snapshots].filter((s) => s.email?.sentAt).sort((a, b) => b.day.localeCompare(a.day))[0];
  return { emailOn: await digestEmailOn(), recipients: digestRecipients(), lastSentAt: sent?.email?.sentAt ?? null, lastDay: last?.day ?? null };
}

export async function getAnalystHistory(): Promise<AnalystHistory> {
  await requirePlatformAdmin();
  const days = trendDays(today(), TREND_DAYS);
  const snapshots = await readSnapshots(days);
  return { trend: trendOf(snapshots, days), digest: await settings(snapshots) };
}

/** Every saved reading of the last fourteen days, whole (the Download button). */
export async function getAnalystHistoryJson(): Promise<{ days: string[]; exportedAt: string; snapshots: AnalystSnapshot[] }> {
  await requirePlatformAdmin();
  const days = trendDays(today(), TREND_DAYS);
  const snapshots = (await readSnapshots(days)).sort((a, b) => a.day.localeCompare(b.day));
  return { days, exportedAt: new Date().toISOString(), snapshots };
}

export async function setTrafficDigestEmail(input: { on?: unknown } = {}): Promise<{ ok: boolean; emailOn: boolean; error?: string }> {
  await requirePlatformAdmin();
  if (typeof input.on !== "boolean") return { ok: false, emailOn: await digestEmailOn(), error: "Choose on or off." };
  try { await setDigestEmail(input.on); return { ok: true, emailOn: input.on }; }
  catch { return { ok: false, emailOn: await digestEmailOn(), error: "The switch could not be saved. Try again." }; }
}
