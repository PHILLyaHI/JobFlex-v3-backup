import "server-only";
// META'S SPEND PER DAY (2026-10-06) — the owner asked how to see "how much per
// day was spent exactly". The ad account's insights, one row per day, written
// as the investors' ad-spend entries with source "meta" (lib/investors
// writeMetaSpend): a hand-typed Meta day is replaced by the real figure, other
// platforms stay. Read every morning by the cron (api/cron/meta-ad-spend) and
// on the owner's "Read from Meta now".
//
// Connecting it (Vercel → Environment Variables, Production):
//   META_ADS_ACCESS_TOKEN  a system-user token with ads_read on the ad account
//   META_AD_ACCOUNT_ID     the ad account id, with or without "act_"
// The token never reaches a log or a page; only "connected" / "not connected".
import { addDays } from "@/lib/investorModel";
import { metaAdsConfigured, writeMetaSpend, writeMetaStatus } from "@/lib/investors";

const GRAPH = () => (process.env.META_GRAPH_VERSION || "v21.0").replace(/[^v0-9.]/g, "");
const TIMEOUT_MS = 20_000;

export interface MetaPull { ok: boolean; days: number; error: string | null }

interface InsightRow { spend?: string; date_start?: string; date_stop?: string }
interface InsightPage { data?: InsightRow[]; paging?: { next?: string }; error?: { message?: string; code?: number } }

/** The last `days` days of spend (the ad account's own days), written as entries. */
export async function pullMetaSpend(days = 14): Promise<MetaPull> {
  if (!metaAdsConfigured()) return { ok: false, days: 0, error: "Meta is not connected." };
  const token = process.env.META_ADS_ACCESS_TOKEN as string;
  const account = (process.env.META_AD_ACCOUNT_ID as string).trim().replace(/^act_/, "").replace(/[^0-9]/g, "");
  const until = new Date().toISOString().slice(0, 10);
  const since = addDays(until, -(Math.max(1, Math.min(90, days)) - 1));
  const params = new URLSearchParams({
    fields: "spend",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    limit: "200",
    access_token: token,
  });
  let url: string | undefined = `https://graph.facebook.com/${GRAPH()}/act_${account}/insights?${params.toString()}`;
  const rows: Array<{ date: string; cents: number }> = [];
  try {
    for (let page = 0; url && page < 5; page++) {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as InsightPage;
      if (!res.ok || body.error) {
        const why = body.error?.message ? body.error.message.replace(/\s+/g, " ").slice(0, 160) : `HTTP ${res.status}`;
        throw new Error(why);
      }
      for (const r of body.data ?? []) {
        const date = typeof r.date_start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date_start) ? r.date_start : null;
        const spend = Number(r.spend);
        if (date && Number.isFinite(spend) && spend >= 0) rows.push({ date, cents: Math.round(spend * 100) });
      }
      url = body.paging?.next;
    }
  } catch (err) {
    const message = err instanceof Error && err.name === "TimeoutError" ? "Meta took too long to answer." : err instanceof Error ? `Meta: ${err.message}` : "Meta did not answer.";
    await writeMetaStatus({ lastPulledAt: null, lastError: message, daysPulled: 0 }).catch(() => undefined);
    return { ok: false, days: 0, error: message };
  }
  // Days Meta lists with no spend are still Meta's word for that day: zero.
  await writeMetaSpend(rows);
  await writeMetaStatus({ lastPulledAt: new Date().toISOString(), lastError: null, daysPulled: rows.length });
  return { ok: true, days: rows.length, error: null };
}
