"use server";

import { requirePlatformAdmin } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { getLiveTraffic as liveTraffic, getStageVisitors, getTrafficExperiments, getTrafficReport } from "@/lib/traffic-server";
import { parseTrafficFilters } from "@/lib/traffic-query";
import { TRAFFIC_SINCE_MS } from "@/lib/traffic-visitor";
import type { SignupAttribution } from "@/lib/traffic-contract";
import { adNameKey, adTagsOf, parseLiveRange, RANGE_MINUTES, signupLedgerSummary, signupPlanLabel, signupSource, signupState, type FreshSignup, type LiveRange, type LiveReport, type SignupLedger, type SignupRecord } from "@/lib/traffic-live";

/** The organizations made in the last day, with the owner who made them —
 *  the rows a live signup is tied back to (lib/traffic-live). */
async function freshSignups(): Promise<FreshSignup[]> {
  try {
    const rows = await db.organization.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: {
        id: true, name: true, createdAt: true, utmSource: true, utmMedium: true, utmCampaign: true, landingIndustry: true,
        memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { email: true, name: true } } } },
        // What they actually signed up FOR. The browser event says what the
        // page offered; this row is Stripe's truth, mirrored by the webhooks,
        // and it is the only place that knows a trial from a payment.
        subscription: { select: { plan: true, status: true, trialEndsAt: true } },
      },
    });
    return rows.map((r) => ({
      orgId: r.id, orgName: r.name, createdAt: r.createdAt.toISOString(),
      ownerEmail: r.memberships[0]?.user.email ?? "", ownerName: r.memberships[0]?.user.name ?? "",
      plan: r.subscription?.plan ?? "", subStatus: r.subscription?.status ?? "",
      trialEndsAt: r.subscription?.trialEndsAt?.toISOString() ?? null,
      utmSource: r.utmSource ?? "", utmMedium: r.utmMedium ?? "", utmCampaign: r.utmCampaign ?? "", landingIndustry: r.landingIndustry ?? "",
    }));
  } catch {
    return []; // the live panel still shows the visitors
  }
}

/** Who is on the site now, where from, how far they got — and the signups
 *  among them named (2026-09-28). `includeDevelopment` shows localhost too. */
/** Signups per platform over the Visitors card's range (2026-10-01): the
 *  organizations made in it, credited by their own utm tags — the ledger's
 *  reading — so "signed up" on a platform card follows the chosen range. */
async function signupsByPlatform(range: LiveRange, fullHistory: boolean): Promise<Record<string, number>> {
  const minutes = RANGE_MINUTES[range];
  // From the ad launch, like every figure on the page, unless the full history is asked for.
  const since = Math.max(minutes === null ? 0 : Date.now() - minutes * 60_000, fullHistory ? 0 : TRAFFIC_SINCE_MS);
  try {
    const rows = await db.organization.groupBy({
      by: ["utmSource", "utmMedium"],
      where: { deletedAt: null, ...(since > 0 ? { createdAt: { gte: new Date(since) } } : {}) },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const r of rows) {
      const p = signupSource({ utmSource: r.utmSource ?? "", utmMedium: r.utmMedium ?? "" }).platform;
      out[p] = (out[p] ?? 0) + r._count._all;
    }
    return out;
  } catch {
    return {};
  }
}

export async function getLiveTraffic(input: Record<string, unknown> = {}): Promise<LiveReport> {
  await requirePlatformAdmin();
  const range = parseLiveRange(input.range);
  const [signups, signedUpBy] = await Promise.all([freshSignups(), signupsByPlatform(range, input.fullHistory === true)]);
  const report = await liveTraffic(signups, {
    range,
    signedUpBy,
    includeDevelopment: input.includeDevelopment === true,
    // "Today" is a LOCAL day, and it has to be the same local day on the
    // server's first paint as in the client's polls. Reading it through
    // parseTrafficFilters gives both the one default (America/Los_Angeles);
    // defaulting to UTC here meant the page rendered one day's figure and
    // then replaced it with another a few seconds later, and paid for two
    // all-time queries to do it.
    timezone: parseTrafficFilters({ timezone: input.timezone }).timezone,
    // Live mode (15 s) asks for a shorter server cache so each tick moves.
    fast: input.fast === true,
    // Counted from TRAFFIC_SINCE unless the admin asks for the full history.
    fullHistory: input.fullHistory === true,
  });
  return withNames(report);
}

/** The names the live view shows next to bare ids (owner, 2026-10-01): the
 *  owner's own names for ad and campaign ids, and the company and person
 *  behind a member's visit. A failed read costs the names, never the panel.
 *  The report from lib/traffic-server is a shared cache — copied, not mutated. */
async function withNames(report: LiveReport): Promise<LiveReport> {
  if (report.status !== "ok") return report;
  const tags = adTagsOf(report);
  const orgIds = [...new Set(report.visitors.map((v) => v.orgId).filter(Boolean))];
  const userIds = [...new Set(report.visitors.map((v) => v.userId).filter(Boolean))];
  const [names, orgs, users] = await Promise.all([
    tags.length ? db.syncState.findMany({ where: { key: { in: tags.map(adNameKey) } }, select: { key: true, cursor: true } }).catch(() => []) : [],
    orgIds.length ? db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }).catch(() => []) : [],
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }).catch(() => []) : [],
  ]);
  const adNames: Record<string, string> = {};
  for (const t of tags) { const row = names.find((n) => n.key === adNameKey(t)); if (row?.cursor) adNames[t] = row.cursor; }
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const userName = new Map(users.map((u) => [u.id, u.name || u.email]));
  return {
    ...report,
    adNames,
    visitors: report.visitors.map((v) => (v.orgId && orgName.has(v.orgId)
      ? { ...v, member: { orgName: orgName.get(v.orgId) ?? "", userName: userName.get(v.userId) ?? "" } }
      : v)),
  };
}

/** Name an ad or campaign id the way the owner knows it ("Roofing · 40 s v1").
 *  Kept in SyncState under `adname:<id>`; an empty name forgets it. */
export async function nameAdTag(input: { tag?: unknown; name?: unknown }): Promise<{ ok: boolean; error?: string }> {
  await requirePlatformAdmin();
  const tag = typeof input.tag === "string" ? input.tag.trim() : "";
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ").slice(0, 60) : "";
  if (!tag || tag.length > 120) return { ok: false, error: "No ad id to name." };
  try {
    if (!name) await db.syncState.deleteMany({ where: { key: adNameKey(tag) } });
    else await db.syncState.upsert({ where: { key: adNameKey(tag) }, create: { key: adNameKey(tag), cursor: name }, update: { cursor: name } });
    return { ok: true };
  } catch {
    return { ok: false, error: "The name could not be saved. Try again." };
  }
}

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

/** THE SIGNUP LEDGER: every account made in the span, who made it, what the
 *  landing recorded about where they came from, and what the subscription is
 *  now (2026-10-01). Reads rows the database already keeps — no new table,
 *  no new column — so the record goes back as far as the accounts do.
 *
 *  The subscription is read in its own pass. Folding it into the main select
 *  would mean one failure there costs the whole ledger; separately, the worst
 *  it can cost is the plan label. */
const LEDGER_LIMIT = 400;
export async function getSignupLedger(input: Record<string, unknown> = {}): Promise<SignupLedger> {
  await requirePlatformAdmin();
  const days = [1, 7, 30, 90, 365].includes(Number(input.days)) ? Number(input.days) : 30;
  // Counted from TRAFFIC_SINCE (the ad launch) unless the full history is asked for.
  const since = new Date(Math.max(Date.now() - days * 24 * 60 * 60 * 1000, input.fullHistory === true ? 0 : TRAFFIC_SINCE_MS));
  const rows = await db.organization.findMany({
    where: { createdAt: { gte: since }, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: LEDGER_LIMIT + 1,
    select: {
      id: true, name: true, createdAt: true,
      utmSource: true, utmMedium: true, utmCampaign: true, utmContent: true, landingIndustry: true,
      memberships: { orderBy: { createdAt: "asc" }, take: 1, select: { user: { select: { email: true, name: true } } } },
    },
  });
  const truncated = rows.length > LEDGER_LIMIT;
  const page = truncated ? rows.slice(0, LEDGER_LIMIT) : rows;

  // The subscriptions, separately — see the note above.
  let subs = new Map<string, { plan: string; status: string; trialEndsAt: Date | null }>();
  try {
    const found = await db.subscription.findMany({
      where: { organizationId: { in: page.map((r) => r.id) } },
      select: { organizationId: true, plan: true, status: true, trialEndsAt: true },
    });
    subs = new Map(found.map((x) => [x.organizationId, { plan: x.plan, status: x.status, trialEndsAt: x.trialEndsAt }]));
  } catch {
    // The ledger still lists who signed up and where from; only the plan
    // column goes quiet.
  }

  const records: SignupRecord[] = page.map((r) => {
    const sub = subs.get(r.id);
    const src = signupSource({ utmSource: r.utmSource ?? "", utmMedium: r.utmMedium ?? "" });
    const shape = { plan: sub?.plan ?? "", subStatus: sub?.status ?? "", trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null };
    return {
      orgId: r.id, orgName: r.name,
      ownerName: r.memberships[0]?.user.name ?? "", ownerEmail: r.memberships[0]?.user.email ?? "",
      createdAt: r.createdAt.toISOString(),
      source: src.label, fromAd: src.fromAd, platform: src.platform,
      campaign: r.utmCampaign ?? "", content: r.utmContent ?? "", industry: r.landingIndustry ?? "",
      planLabel: signupPlanLabel(shape),
      state: signupState(shape.subStatus),
    };
  });
  return { days, records, summary: signupLedgerSummary(records), truncated };
}

export async function getTrafficDashboard(input: Record<string, unknown> = {}) {
  await requirePlatformAdmin();
  return getTrafficReport(parseTrafficFilters(input));
}

/** The A/B bench's figures, when its tab opens (2026-10-01). */
export async function getTrafficExperimentsAction(input: Record<string, unknown> = {}) {
  await requirePlatformAdmin();
  return getTrafficExperiments(parseTrafficFilters(input));
}

/** Who reached a funnel stage: device, place, source and how far they got. */
export async function getTrafficStageVisitors(input: Record<string, unknown> = {}, stageId: unknown) {
  await requirePlatformAdmin();
  if (typeof stageId !== "string" || !/^[a-z]+$/.test(stageId)) throw new Error("Choose a funnel stage.");
  return getStageVisitors(parseTrafficFilters(input), stageId);
}
