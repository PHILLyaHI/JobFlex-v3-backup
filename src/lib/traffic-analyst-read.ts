// THE ANALYST'S READING, server side (2026-10-04): the week's sessions from
// PostHog (traffic-server's ten-minute cache), the owner's names for the ads
// (SyncState adname:*), and analyse() over them. Shared by the admin's
// actions — the panel, its exports, "Export everything" — so each of them
// reads the same week the same way. No auth here: every caller checks it.

import { db } from "./db";
import { analyse, analystWindowFrom, ANALYST_DAYS, type AnalystReport, type LandingSession } from "./traffic-analyst";
import type { StaleNote } from "./traffic-contract";
import { adNameKey } from "./traffic-live";
import { parseTrafficFilters } from "./traffic-query";
import { fetchAnalystSessions, orLastGood, posthogApiConfig } from "./traffic-server";

export interface AnalystResult {
  status: "ok" | "disabled" | "error";
  message?: string;
  /** When PostHog answered for these sessions — not when the page asked. */
  fetchedAt: string;
  /** The window read: `days` back from the read, never before the ad launch. */
  window?: { from: string; to: string };
  report: AnalystReport;
  stale?: StaleNote;
}

export interface AnalystReading { result: AnalystResult; sessions: LandingSession[]; adNames: Record<string, string>; timezone: string }

/** The owner's names for the ad and campaign ids these sessions carry. */
export async function adNamesFor(sessions: readonly LandingSession[]): Promise<Record<string, string>> {
  const tags = [...new Set(sessions.flatMap((s) => [s.utmCampaign, s.utmContent]).filter((t) => t && t.length <= 120))];
  if (!tags.length) return {};
  const rows = await db.syncState.findMany({ where: { key: { in: tags.map(adNameKey) } }, select: { key: true, cursor: true } }).catch(() => []);
  const names: Record<string, string> = {};
  for (const t of tags) { const row = rows.find((r) => r.key === adNameKey(t)); if (row?.cursor) names[t] = row.cursor; }
  return names;
}

export async function readAnalyst(input: { timezone?: unknown; force?: unknown } = {}): Promise<AnalystReading> {
  const now = new Date().toISOString();
  const timezone = parseTrafficFilters({ timezone: input.timezone }).timezone;
  const none = (status: "disabled" | "error", message: string): AnalystReading => ({ result: { status, message, fetchedAt: now, report: analyse([], { timezone }) }, sessions: [], adNames: {}, timezone });
  try {
    if (!posthogApiConfig()) return none("disabled", "Connect a PostHog personal key with query:read and a numeric project ID.");
    // PostHog down: the week as it last read, and from when.
    const { value: { sessions, readAt }, stale } = await orLastGood("analyst", fetchAnalystSessions(input.force === true));
    const adNames = await adNamesFor(sessions);
    const at = Date.parse(readAt);
    const result: AnalystResult = {
      status: "ok", fetchedAt: readAt,
      window: { from: new Date(analystWindowFrom(at)).toISOString(), to: readAt },
      // The reading as of the read, so a cached week does not drift against "now".
      report: analyse(sessions, { timezone, adNames, now: at, days: ANALYST_DAYS }),
      ...(stale ? { stale } : {}),
    };
    return { result, sessions, adNames, timezone };
  } catch (err) {
    return none("error", err instanceof Error && err.name === "TimeoutError" ? "PostHog took too long. Try again shortly." : err instanceof Error ? err.message : "The analyst could not read.");
  }
}
