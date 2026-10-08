import "server-only";
// META'S FIGURES (2026-10-06; by campaign and with clicks since 2026-10-08 —
// owner: "live spending per day, per week, per month; show all the costs").
// Two reads of the ad account's insights for the last `days` days:
//   · by day — spend, impressions, clicks, reach: the spend becomes the
//     investors' ad-spend entries with source "meta" (lib/investors
//     writeMetaSpend: a hand-typed Meta day is replaced, other platforms stay);
//   · by campaign — the same figures per campaign, so the page can say what
//     each ad cost and, joined to the signups' utm_campaign, what a signup
//     from it cost.
// Both are kept in SyncState `metaInsights`. Read every morning by the cron
// (api/cron/meta-ad-spend), on the owner's "Read from Meta now", and by the
// admin page itself when the last read is over an hour old (metaPullIfStale).
//
// Connecting it (Vercel → Environment Variables, Production):
//   META_ADS_ACCESS_TOKEN  a system-user token with ads_read on the ad account
//   META_AD_ACCOUNT_ID     the ad account id, with or without "act_"
// The token never reaches a log or a page; only "connected" / "not connected".
// Outside production META_GRAPH_HOST may point at a local stand-in (the stand's
// walks); in production the host is always graph.facebook.com.
import { addDays } from "@/lib/investorModel";
import { metaAdsConfigured, readInvestorSettings, readMetaStatus, writeMetaInsights, writeMetaSpend, writeMetaStatus, type MetaCampaign, type MetaDay } from "@/lib/investors";
import { TRAFFIC_SINCE } from "@/lib/traffic-visitor";

const GRAPH = () => (process.env.META_GRAPH_VERSION || "v21.0").replace(/[^v0-9.]/g, "");
const HOST = () => {
  const local = process.env.META_GRAPH_HOST?.trim();
  if (local && process.env.NODE_ENV !== "production" && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(local)) return local;
  return "https://graph.facebook.com";
};
const TIMEOUT_MS = 20_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface MetaPull { ok: boolean; days: number; campaigns: number; error: string | null }

interface InsightRow { spend?: string; impressions?: string; clicks?: string; reach?: string; date_start?: string; date_stop?: string; campaign_id?: string; campaign_name?: string }
interface InsightPage { data?: InsightRow[]; paging?: { next?: string }; error?: { message?: string; code?: number } }

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
const cents = (v: unknown) => Math.round(num(v) * 100);

/** Every page of one insights read. */
async function readPages(url: string): Promise<InsightRow[]> {
  const out: InsightRow[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < 8; page++) {
    const res = await fetch(next, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    const body = (await res.json().catch(() => ({}))) as InsightPage;
    if (!res.ok || body.error) throw new Error(body.error?.message ? body.error.message.replace(/\s+/g, " ").slice(0, 160) : `HTTP ${res.status}`);
    out.push(...(body.data ?? []));
    next = body.paging?.next;
  }
  return out;
}

/** The last `days` days of the ad account's figures, kept, with the spend as entries. */
export async function pullMetaSpend(days = 14): Promise<MetaPull> {
  if (!metaAdsConfigured()) return { ok: false, days: 0, campaigns: 0, error: "Meta is not connected." };
  const token = process.env.META_ADS_ACCESS_TOKEN as string;
  const account = (process.env.META_AD_ACCOUNT_ID as string).trim().replace(/^act_/, "").replace(/[^0-9]/g, "");
  const until = new Date().toISOString().slice(0, 10);
  const since = addDays(until, -(Math.max(1, Math.min(90, days)) - 1));
  const base = `${HOST()}/${GRAPH()}/act_${account}/insights`;
  // The campaign totals cover the same days the signups are counted from — the
  // investors' start day when it is inside the window — so a cost per signup
  // divides like by like.
  const startDay = (await readInvestorSettings().catch(() => null))?.sinceDate ?? TRAFFIC_SINCE;
  const campaignsSince = startDay > since ? (startDay > until ? until : startDay) : since;
  const byDay = new URLSearchParams({ fields: "spend,impressions,clicks,reach", time_increment: "1", time_range: JSON.stringify({ since, until }), limit: "500", access_token: token });
  const byCampaign = new URLSearchParams({ fields: "campaign_id,campaign_name,spend,impressions,clicks,reach", level: "campaign", time_range: JSON.stringify({ since: campaignsSince, until }), limit: "500", access_token: token });
  let dayRows: MetaDay[] = [];
  let campaigns: MetaCampaign[] = [];
  try {
    for (const r of await readPages(`${base}?${byDay.toString()}`)) {
      const date = typeof r.date_start === "string" && DATE.test(r.date_start) ? r.date_start : null;
      if (date) dayRows.push({ date, spendCents: cents(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), reach: num(r.reach) });
    }
    for (const r of await readPages(`${base}?${byCampaign.toString()}`)) {
      if (typeof r.campaign_id === "string" && r.campaign_id) campaigns.push({ id: r.campaign_id, name: typeof r.campaign_name === "string" ? r.campaign_name : "", spendCents: cents(r.spend), impressions: num(r.impressions), clicks: num(r.clicks), reach: num(r.reach) });
    }
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError" ? "Meta took too long to answer." : err instanceof Error ? `Meta: ${err.message}` : "Meta did not answer.";
    const was = await readMetaStatus().catch(() => null);
    await writeMetaStatus({ lastPulledAt: was?.lastPulledAt ?? null, lastError: message, daysPulled: was?.daysPulled ?? 0 }).catch(() => undefined);
    return { ok: false, days: 0, campaigns: 0, error: message };
  }
  dayRows = dayRows.sort((a, b) => (a.date < b.date ? -1 : 1));
  campaigns = campaigns.sort((a, b) => b.spendCents - a.spendCents);
  // Days Meta lists with no spend are still Meta's word for that day: zero.
  await writeMetaSpend(dayRows.map((d) => ({ date: d.date, cents: d.spendCents })));
  await writeMetaInsights({ at: new Date().toISOString(), since, until, campaignsSince, days: dayRows, campaigns });
  await writeMetaStatus({ lastPulledAt: new Date().toISOString(), lastError: null, daysPulled: dayRows.length });
  return { ok: true, days: dayRows.length, campaigns: campaigns.length, error: null };
}

/** A read when the last one is older than `maxAgeMinutes` (or failed); null when it is fresh. Never throws. */
export async function metaPullIfStale(maxAgeMinutes = 60): Promise<MetaPull | null> {
  if (!metaAdsConfigured()) return null;
  try {
    const status = await readMetaStatus();
    const last = status.lastPulledAt ? Date.parse(status.lastPulledAt) : NaN;
    if (Number.isFinite(last) && Date.now() - last < maxAgeMinutes * 60_000 && !status.lastError) return null;
    return await pullMetaSpend(30);
  } catch (err) {
    return { ok: false, days: 0, campaigns: 0, error: err instanceof Error ? err.message : "Meta did not answer." };
  }
}
