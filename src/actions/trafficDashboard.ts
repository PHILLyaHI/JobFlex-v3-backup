"use server";

import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getStageVisitors, getTrafficReport } from "@/lib/traffic-server";
import { parseTrafficFilters } from "@/lib/traffic-query";
import type { SignupAttribution } from "@/lib/traffic-contract";

/** Signups by what the landing recorded on the organization — the trade hero
 *  and the utm_* — straight from the database, so campaign results do not
 *  depend on PostHog (CRO stage 1, 2026-09-09). Same date range as the
 *  report; days are taken in UTC, which is close enough for a daily table. */
export async function getSignupAttribution(input: Record<string, unknown> = {}): Promise<SignupAttribution> {
  await requirePlatformAdmin();
  const f = parseTrafficFilters(input);
  const from = new Date(`${f.from}T00:00:00.000Z`);
  const to = new Date(new Date(`${f.to}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000);
  const rows = await db.organization.findMany({
    where: { createdAt: { gte: from, lt: to }, deletedAt: null },
    select: { landingIndustry: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true },
  });
  const keys = ["landingIndustry", "utmSource", "utmMedium", "utmCampaign", "utmContent"] as const;
  const dimensions = {} as SignupAttribution["dimensions"];
  for (const key of keys) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const name = r[key] || (key === "landingIndustry" ? "default" : "(none)");
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    dimensions[key] = [...counts.entries()].map(([name, signups]) => ({ name, signups })).sort((a, b) => b.signups - a.signups);
  }
  return { from: f.from, to: f.to, total: rows.length, dimensions };
}

export async function getTrafficDashboard(input: Record<string, unknown> = {}) {
  await requirePlatformAdmin();
  return getTrafficReport(parseTrafficFilters(input));
}

/** Who reached a funnel stage: device, place, source and how far they got. */
export async function getTrafficStageVisitors(input: Record<string, unknown> = {}, stageId: unknown) {
  await requirePlatformAdmin();
  if (typeof stageId !== "string" || !/^[a-z]+$/.test(stageId)) throw new Error("Choose a funnel stage.");
  return getStageVisitors(parseTrafficFilters(input), stageId);
}
