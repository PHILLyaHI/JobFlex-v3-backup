import "server-only";
// THE INVESTOR PAGE'S DATA (owner, 2026-10-06) — what is kept, and the one
// read that builds the report for the admin page, the shared link and the
// PDF alike. Nothing new in the schema: three SyncState rows.
//
//   adSpend          the ad budget, a list of days — typed in by hand until
//                    Meta's API token arrives (then a cron writes the same
//                    rows with source "meta" and the hand entries stay);
//   investorSettings the realistic share (60% unless changed), the projected
//                    daily spend, the horizon, the trial length, and the
//                    shared link's token and switch;
//
// The accounts come from the same rows the signups list reads (since the ad
// launch, hidden accounts out, lib/statsHidden), priced the same way (lib/
// trialProjectionRead); the visitors from the live map's totals.
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { countedOrgs, statsHiddenIds } from "@/lib/statsHidden";
import { signupState } from "@/lib/traffic-live";
import { TRAFFIC_SINCE, TRAFFIC_SINCE_MS, TRAFFIC_TZ } from "@/lib/traffic-visitor";
import { fetchInvestorVisitors } from "@/lib/traffic-server";
import { valueSignups } from "@/lib/trialProjectionRead";
import { investorFigures, dayOf, PLATFORMS, PLATFORM_LABEL, type InvestorAssumptions, type InvestorFigures, type SpendDay, type SpendPlatform } from "@/lib/investorModel";

export const AD_SPEND_KEY = "adSpend";
export const INVESTOR_SETTINGS_KEY = "investorSettings";

// The platform list lives in the pure model so the client page can list it.
export { PLATFORMS, PLATFORM_LABEL, type SpendPlatform } from "@/lib/investorModel";

export interface AdSpendEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  platform: SpendPlatform;
  cents: number;
  source: "manual" | "meta";
  note?: string;
  by?: string | null;
  at: string;
}

export interface InvestorSettings extends InvestorAssumptions {
  /** The day the first campaign went live (owner, 2026-10-06: "count only what
   *  happened after that"); null = the live map's start, TRAFFIC_SINCE. */
  sinceDate: string | null;
  linkToken: string | null;
  linkEnabled: boolean;
  /** When the link was last made. */
  linkMadeAt: string | null;
}

export const DEFAULT_SETTINGS: InvestorSettings = { realisticPct: 60, spendPerDayCents: null, horizonDays: 180, trialDays: 7, sinceDate: null, linkToken: null, linkEnabled: false, linkMadeAt: null };
const MAX_ENTRIES = 3000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const parse = <T,>(text: string | null | undefined): T | null => {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
};
async function readKey(key: string): Promise<string | null> {
  try {
    return (await db.syncState.findUnique({ where: { key }, select: { cursor: true } }))?.cursor ?? null;
  } catch {
    return null;
  }
}
async function writeKey(key: string, value: unknown): Promise<void> {
  const cursor = JSON.stringify(value);
  await db.syncState.upsert({ where: { key }, create: { key, cursor }, update: { cursor } });
}

/* ── ad spend ─────────────────────────────────────────────────────────── */

export function cleanEntries(raw: unknown): AdSpendEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: AdSpendEntry[] = [];
  for (const e of raw) {
    const r = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    const date = typeof r.date === "string" && DATE.test(r.date) ? r.date : null;
    const cents = typeof r.cents === "number" && Number.isFinite(r.cents) ? Math.round(r.cents) : NaN;
    if (!date || !Number.isFinite(cents) || cents < 0 || typeof r.id !== "string") continue;
    out.push({
      id: r.id.slice(0, 40),
      date,
      platform: (PLATFORMS as readonly string[]).includes(String(r.platform)) ? (r.platform as SpendPlatform) : "other",
      cents,
      source: r.source === "meta" ? "meta" : "manual",
      note: typeof r.note === "string" ? r.note.slice(0, 120) : undefined,
      by: typeof r.by === "string" ? r.by : null,
      at: typeof r.at === "string" ? r.at : new Date(0).toISOString(),
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, MAX_ENTRIES);
}

export async function readAdSpend(): Promise<AdSpendEntry[]> {
  return cleanEntries(parse(await readKey(AD_SPEND_KEY)));
}

export interface AddSpendInput {
  from: string;
  to: string;
  perDayCents: number;
  platform: SpendPlatform;
  note?: string;
}

/** One entry per day from `from` to `to` (366 days at most), replacing hand entries of the same platform on those days. */
export async function addAdSpend(input: AddSpendInput, by: string | null): Promise<AdSpendEntry[]> {
  const days: string[] = [];
  for (let d = input.from; d <= input.to && days.length < 366; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) days.push(d);
  const now = new Date().toISOString();
  const fresh: AdSpendEntry[] = days.map((date) => ({ id: `${date}-${input.platform}-${randomBytes(3).toString("hex")}`, date, platform: input.platform, cents: Math.round(input.perDayCents), source: "manual", note: input.note?.trim() || undefined, by, at: now }));
  const have = await readAdSpend();
  const replaced = new Set(days);
  const kept = have.filter((e) => !(e.source === "manual" && e.platform === input.platform && replaced.has(e.date)));
  const next = cleanEntries([...kept, ...fresh]);
  await writeKey(AD_SPEND_KEY, next);
  return next;
}

export async function deleteAdSpend(id: string): Promise<AdSpendEntry[]> {
  const next = (await readAdSpend()).filter((e) => e.id !== id);
  if (next.length === 0) await db.syncState.deleteMany({ where: { key: AD_SPEND_KEY } });
  else await writeKey(AD_SPEND_KEY, next);
  return next;
}

/* ── settings and the shared link ─────────────────────────────────────── */

export function cleanSettings(raw: unknown): InvestorSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  return {
    realisticPct: Math.round(num(r.realisticPct, DEFAULT_SETTINGS.realisticPct, 0, 100)),
    spendPerDayCents: typeof r.spendPerDayCents === "number" && Number.isFinite(r.spendPerDayCents) && r.spendPerDayCents >= 0 ? Math.round(r.spendPerDayCents) : null,
    horizonDays: Math.round(num(r.horizonDays, DEFAULT_SETTINGS.horizonDays, 30, 730)),
    trialDays: Math.round(num(r.trialDays, DEFAULT_SETTINGS.trialDays, 1, 90)),
    sinceDate: typeof r.sinceDate === "string" && DATE.test(r.sinceDate) && r.sinceDate >= "2025-01-01" ? r.sinceDate : null,
    linkToken: typeof r.linkToken === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(r.linkToken) ? r.linkToken : null,
    linkEnabled: r.linkEnabled === true,
    linkMadeAt: typeof r.linkMadeAt === "string" ? r.linkMadeAt : null,
  };
}

export async function readInvestorSettings(): Promise<InvestorSettings> {
  return cleanSettings(parse(await readKey(INVESTOR_SETTINGS_KEY)));
}

export async function saveInvestorSettings(patch: Partial<InvestorSettings>): Promise<InvestorSettings> {
  const next = cleanSettings({ ...(await readInvestorSettings()), ...patch });
  await writeKey(INVESTOR_SETTINGS_KEY, next);
  return next;
}

/** A new shared link (the old one stops working), switched on. */
export async function rotateInvestorLink(): Promise<InvestorSettings> {
  return saveInvestorSettings({ linkToken: randomBytes(18).toString("base64url"), linkEnabled: true, linkMadeAt: new Date().toISOString() });
}

/** True when `token` is the live shared link. */
export async function investorLinkOpen(token: string): Promise<boolean> {
  const s = await readInvestorSettings();
  return !!s.linkToken && s.linkEnabled && token === s.linkToken;
}

/* ── the report ───────────────────────────────────────────────────────── */

export interface InvestorReport {
  figures: InvestorFigures;
  settings: InvestorSettings;
  spend: { entries: AdSpendEntry[]; byPlatform: Array<{ platform: SpendPlatform; label: string; cents: number; days: number }> };
  /** The analytics answered (visitors are real), or not. */
  visitorsKnown: boolean;
  /** Paying accounts whose plan has no list price — counted as $0 in the MRR, and said so. */
  payingUnpriced: number;
  /** Accounts paying from before the start day — not counted, but named. */
  before: { paying: number; mrrCents: number };
  /** The first day a visitor arrived from an ad (utm_source or fbclid), when the analytics answered. */
  firstAdDay: string | null;
  /** When this was read. */
  at: string;
}

/** Midnight of `date` in `tz`, as a timestamp (the day's offset read from Intl). */
function dayStartMs(date: string, tz: string): number {
  const guess = Date.parse(`${date}T00:00:00Z`);
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(new Date(guess)).find((x) => x.type === "timeZoneName")?.value ?? "GMT";
  const m = /([+-])(\d{2}):?(\d{2})?/.exec(name);
  const offsetMin = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
  return guess - offsetMin * 60_000;
}

const todayIn = (tz: string) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const n = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${n("year")}-${n("month")}-${n("day")}`;
};

export async function investorReport(): Promise<InvestorReport> {
  const [entries, settings, hidden] = await Promise.all([readAdSpend(), readInvestorSettings(), statsHiddenIds()]);
  const today = todayIn(TRAFFIC_TZ);
  // The start day: the first campaign's (owner, 2026-10-06), else the live map's.
  const since = settings.sinceDate ?? TRAFFIC_SINCE;
  const sinceMs = settings.sinceDate ? dayStartMs(since, TRAFFIC_TZ) : TRAFFIC_SINCE_MS;

  // The accounts since the start day, with their subscriptions — the signups list's rows.
  const orgs = await db.organization.findMany({
    where: { createdAt: { gte: new Date(sinceMs) }, ...countedOrgs(hidden) },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { id: true, createdAt: true, subscription: { select: { plan: true, status: true, trialEndsAt: true, stripePriceId: true, externalSubId: true, provider: true, createdAt: true } } },
  });
  // Every paying account; the ones from before the start day are named, not counted.
  const payingAll = await db.subscription.findMany({
    where: { status: "ACTIVE", organization: countedOrgs(hidden) },
    select: { organizationId: true, plan: true, status: true, trialEndsAt: true, stripePriceId: true, externalSubId: true, provider: true, createdAt: true, organization: { select: { createdAt: true } } },
  });

  const payRow = (p: (typeof payingAll)[number]) => ({ orgId: p.organizationId, createdAt: p.organization.createdAt, state: "paying" as const, sub: { plan: p.plan, status: p.status, trialEndsAt: p.trialEndsAt, stripePriceId: p.stripePriceId, externalSubId: p.externalSubId, provider: p.provider }, subCreatedAt: p.createdAt, trialEndsAt: p.trialEndsAt });
  const rows = [
    ...orgs.map((o) => ({ orgId: o.id, createdAt: o.createdAt, state: signupState(o.subscription?.status ?? ""), sub: o.subscription ? { plan: o.subscription.plan, status: o.subscription.status, trialEndsAt: o.subscription.trialEndsAt, stripePriceId: o.subscription.stripePriceId, externalSubId: o.subscription.externalSubId, provider: o.subscription.provider } : null, subCreatedAt: o.subscription?.createdAt ?? o.createdAt, trialEndsAt: o.subscription?.trialEndsAt ?? null })),
    ...payingAll.filter((p) => p.organization.createdAt.getTime() >= sinceMs && !orgs.some((o) => o.id === p.organizationId)).map(payRow),
  ];
  const beforeRows = payingAll.filter((p) => p.organization.createdAt.getTime() < sinceMs).map(payRow);
  let values = new Map<string, { monthlyCents: number | null; chance?: number }>();
  try {
    values = (await valueSignups([...rows, ...beforeRows].map((r) => ({ orgId: r.orgId, createdAt: r.createdAt, state: r.state, sub: r.sub })), Date.now())).values;
  } catch {
    values = new Map();
  }

  const paying = rows.filter((r) => r.state === "paying").map((r) => {
    // Paying from the trial's end when there was one, else from the subscription.
    const ends = r.trialEndsAt && r.trialEndsAt.getTime() < Date.now() ? r.trialEndsAt : r.subCreatedAt;
    return { startedAt: dayOf(ends.toISOString()), monthlyCents: values.get(r.orgId)?.monthlyCents ?? 0 };
  });
  const trials = rows.filter((r) => r.state === "trial").map((r) => {
    const v = values.get(r.orgId);
    return { createdAt: dayOf(r.createdAt.toISOString()), endsAt: r.trialEndsAt ? dayOf(r.trialEndsAt.toISOString()) : null, monthlyCents: v?.monthlyCents ?? null, chance: v?.chance ?? 0.2 };
  });
  const lapsed = rows.filter((r) => r.state === "lapsed").length;
  const payingUnpriced = rows.filter((r) => r.state === "paying" && values.get(r.orgId)?.monthlyCents == null).length;

  const before = { paying: beforeRows.length, mrrCents: beforeRows.reduce((a, r) => a + (values.get(r.orgId)?.monthlyCents ?? 0), 0) };

  let visitors: number | null = null;
  let firstAdDay: string | null = null;
  try {
    const v = await fetchInvestorVisitors(since, TRAFFIC_TZ);
    visitors = v.visitors;
    firstAdDay = v.firstAdDay;
  } catch {
    visitors = null;
  }

  const spend: SpendDay[] = entries.map((e) => ({ date: e.date, cents: e.cents }));
  const figures = investorFigures({ since, today, spend, paying, trials, lapsed, assumptions: settings, visitors });
  const byPlatform = PLATFORMS.map((platform) => {
    const mine = entries.filter((e) => e.platform === platform && e.date >= since && e.date <= today);
    return { platform, label: PLATFORM_LABEL[platform], cents: mine.reduce((a, e) => a + e.cents, 0), days: new Set(mine.map((e) => e.date)).size };
  }).filter((p) => p.cents > 0);
  return { figures, settings, spend: { entries, byPlatform }, visitorsKnown: visitors !== null, payingUnpriced, before, firstAdDay, at: new Date().toISOString() };
}
