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
/** The UTC instant of local midnight on `date` (+ `plusDays`) in `timezone`. */
function zonedMidnight(date: string, timezone: string, plusDays = 0): Date {
  const guess = new Date(Date.parse(`${date}T00:00:00Z`) + plusDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(guess);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return new Date(guess.getTime() - (local - guess.getTime()));
}

export async function getSignupAttribution(input: Record<string, unknown> = {}): Promise<SignupAttribution> {
  await requirePlatformAdmin();
  const f = parseTrafficFilters(input);
  // Day boundaries in the report's timezone, like the PostHog queries (pass A,
  // 2026-09-11): UTC midnights put a signup made at 9 pm Pacific on the next
  // day, outside a range that ends "today".
  const from = zonedMidnight(f.from, f.timezone);
  const to = zonedMidnight(f.to, f.timezone, 1);
  const rows = await db.organization.findMany({
    where: { createdAt: { gte: from, lt: to }, deletedAt: null },
    select: { landingIndustry: true, signupVariant: true, utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true },
  });
  const keys = ["landingIndustry", "signupVariant", "utmSource", "utmMedium", "utmCampaign", "utmContent"] as const;
  const dimensions = {} as SignupAttribution["dimensions"];
  for (const key of keys) {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const name = r[key] || (key === "landingIndustry" ? "default" : key === "signupVariant" ? "d" : "(none)");
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
