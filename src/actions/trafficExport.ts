"use server";

// THE TRAFFIC PAGE'S EXPORTS (2026-10-04): the analyst's raw sessions for its
// JSON / CSV buttons, and "Export everything" — the page as one Markdown file,
// built on the server from the same functions and caches the page reads, so
// the file says what the screen says. Platform admins only.

import { requirePlatformAdmin } from "@/lib/orgContext";
import { readAnalyst, type AnalystResult } from "@/lib/traffic-analyst-read";
import type { LandingSession } from "@/lib/traffic-analyst";
import { trafficToMarkdown } from "@/lib/traffic-export";
import { parseTrafficFilters } from "@/lib/traffic-query";
import { getLiveTraffic, getSignupAttribution, getSignupLedger, getTrafficDashboard } from "./trafficDashboard";

export interface AnalystExport { result: AnalystResult; sessions: LandingSession[]; adNames: Record<string, string>; exportedAt: string }

/** The analyst's reading with the sessions behind it (the panel shows only the reading). */
export async function getAnalystExport(input: Record<string, unknown> = {}): Promise<AnalystExport> {
  await requirePlatformAdmin();
  const { result, sessions, adNames } = await readAnalyst({ timezone: input.timezone });
  return { result, sessions, adNames, exportedAt: new Date().toISOString() };
}

/** Every block of the page as one Markdown file, under the page's current filters. */
export async function getTrafficExportMarkdown(input: Record<string, unknown> = {}): Promise<{ markdown: string; name: string }> {
  await requirePlatformAdmin();
  const filters = parseTrafficFilters(input);
  const fullHistory = filters.fullHistory;
  const ledgerDays = [1, 7, 30, 90, 365].includes(Number(input.ledgerDays)) ? Number(input.ledgerDays) : 30;
  const [analyst, live, report, ledger, attribution] = await Promise.all([
    readAnalyst({ timezone: filters.timezone }).then((r) => r.result),
    getLiveTraffic({ fullHistory }),
    getTrafficDashboard({ ...filters }),
    getSignupLedger({ days: ledgerDays, fullHistory }),
    getSignupAttribution({ ...filters }).catch(() => null),
  ]);
  const generatedAt = new Date().toISOString();
  const markdown = trafficToMarkdown({ generatedAt, timezone: filters.timezone, filters: report.filters, analyst, live, report, ledger, attribution });
  return { markdown, name: `jobflex-traffic-${report.filters.from}_${report.filters.to}-exported-${generatedAt.slice(0, 10)}.md` };
}
