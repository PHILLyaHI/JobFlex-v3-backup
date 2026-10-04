// THE ANALYST'S HISTORY (2026-10-04): one reading a day, saved by the daily
// digest (lib/traffic-digest) in SyncState under `analyst:<YYYY-MM-DD>` (the
// Los Angeles day), and the trend read off the last fourteen of them — each
// finding's tone and sample by day, the funnel by day, and what appeared or
// went away since the day before. Pure: the server hands in the rows.

import type { AdMoney } from "./traffic-money";
import type { AnalystFinding, AnalystReport } from "./traffic-analyst";
import { shiftDate } from "./traffic-query";

export const TREND_DAYS = 14;
export const snapshotKey = (day: string) => `analyst:${day}`;
export const isSnapshotKey = (key: string) => /^analyst:\d{4}-\d{2}-\d{2}$/.test(key);

/** One day's saved reading, as the SyncState row holds it (JSON). */
export interface AnalystSnapshot {
  day: string;
  savedAt: string;
  /** When PostHog answered for the reading. */
  fetchedAt: string;
  window?: { from: string; to: string };
  report: AnalystReport;
  money?: AdMoney;
  /** The digest email: who, when — or why not. */
  email?: { to: string[]; sentAt?: string; skipped?: string; error?: string };
}

/** A snapshot row → the snapshot, or null when it is not one. */
export function parseSnapshot(cursor: string): AnalystSnapshot | null {
  try {
    const v = JSON.parse(cursor) as AnalystSnapshot;
    return v && typeof v.day === "string" && v.report && Array.isArray(v.report.findings) ? v : null;
  } catch { return null; }
}

/** The fourteen days the trend shows, oldest first, ending `today`. */
export function trendDays(today: string, n = TREND_DAYS): string[] {
  return Array.from({ length: n }, (_, i) => shiftDate(today, i - (n - 1)));
}

export interface TrendCell { tone: AnalystFinding["tone"]; n: number; title: string; confidence: AnalystFinding["confidence"] }
export interface TrendRow { id: string; title: string; tone: AnalystFinding["tone"]; cells: Record<string, TrendCell | null> }
export interface TrendDay {
  day: string;
  savedAt: string;
  fetchedAt: string;
  period: string;
  headline: string;
  landed: number;
  fromAds: number;
  basis: "ads" | "all";
  funnel: AnalystReport["funnel"];
  emailed: boolean;
}
export interface TrendChange { id: string; title: string; tone: AnalystFinding["tone"]; n: number }
export interface TrendChanges {
  day: string;
  /** The reading it is compared with — the day before, or the last one before it. */
  against: string;
  appeared: TrendChange[];
  gone: TrendChange[];
  toneChanged: Array<TrendChange & { from: AnalystFinding["tone"] }>;
}
export interface AnalystTrend {
  days: string[];
  /** The days that have a reading, oldest first. */
  readings: TrendDay[];
  rows: TrendRow[];
  changes: TrendChanges | null;
}

const TONE_ORDER: Record<AnalystFinding["tone"], number> = { bad: 0, warn: 1, good: 2, info: 3 };

/** What changed between two readings, by finding id. */
export function changesBetween(prev: AnalystSnapshot, cur: AnalystSnapshot): TrendChanges {
  const before = new Map(prev.report.findings.map((f) => [f.id, f]));
  const now = new Map(cur.report.findings.map((f) => [f.id, f]));
  const pick = (f: AnalystFinding): TrendChange => ({ id: f.id, title: f.title, tone: f.tone, n: f.n });
  return {
    day: cur.day, against: prev.day,
    appeared: cur.report.findings.filter((f) => !before.has(f.id)).map(pick),
    gone: prev.report.findings.filter((f) => !now.has(f.id)).map(pick),
    toneChanged: cur.report.findings.filter((f) => before.has(f.id) && before.get(f.id)!.tone !== f.tone).map((f) => ({ ...pick(f), from: before.get(f.id)!.tone })),
  };
}

/** The trend over `days` from the saved snapshots (any order, any extra days ignored). */
export function trendOf(snapshots: readonly AnalystSnapshot[], days: readonly string[]): AnalystTrend {
  const inRange = snapshots.filter((s) => days.includes(s.day)).sort((a, b) => a.day.localeCompare(b.day));
  const readings: TrendDay[] = inRange.map((s) => ({
    day: s.day, savedAt: s.savedAt, fetchedAt: s.fetchedAt, period: s.report.period ?? `last ${s.report.days} days`, headline: s.report.headline,
    landed: s.report.sample.landed, fromAds: s.report.sample.fromAds, basis: s.report.sample.basis, funnel: s.report.funnel, emailed: !!s.email?.sentAt,
  }));
  const rows = new Map<string, TrendRow>();
  for (const s of inRange) {
    for (const f of s.report.findings) {
      let row = rows.get(f.id);
      if (!row) { row = { id: f.id, title: f.title, tone: f.tone, cells: Object.fromEntries(days.map((d) => [d, null])) }; rows.set(f.id, row); }
      row.cells[s.day] = { tone: f.tone, n: f.n, title: f.title, confidence: f.confidence };
      // The row is named and ranked by its latest reading.
      row.title = f.title; row.tone = f.tone;
    }
  }
  const latestDay = inRange.at(-1)?.day ?? "";
  const ordered = [...rows.values()].sort((a, b) => {
    const aNow = a.cells[latestDay] ? 0 : 1, bNow = b.cells[latestDay] ? 0 : 1;
    return aNow - bNow || TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.id.localeCompare(b.id);
  });
  const changes = inRange.length >= 2 ? changesBetween(inRange[inRange.length - 2], inRange[inRange.length - 1]) : null;
  return { days: [...days], readings, rows: ordered, changes };
}
