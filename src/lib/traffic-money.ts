// AD → MONEY (2026-10-04): for each ad and each campaign, the accounts it
// brought and what they are now — on a trial, paying, lapsed — from the
// organizations the landing tagged (utm_campaign / utm_content, the same rows
// the signups list and the attribution read) and their Subscription. Counted
// from the ad launch, not the analyst's week: a trial turns into money weeks
// after the click. Pure; the server hands in the rows.

import { adNameOf } from "./traffic-analyst";
import type { SignupState } from "./traffic-live";

export interface MoneySignup { campaign: string; content: string; state: SignupState }
export interface MoneyCounts { signups: number; trial: number; paying: number; lapsed: number; other: number }
export interface MoneyRow extends MoneyCounts {
  /** The ad's key as the analyst groups it (utm_content, else utm_campaign), or the campaign id. */
  key: string;
  name: string;
  /** The campaign an ad ran under ("" for a campaign row). */
  campaign: string;
  /** Landing visits from this ad in the analyst's window (null when it had none there). */
  visits: number | null;
}
export interface AdMoney {
  /** Where the count starts (ISO): the ad launch. */
  since: string;
  total: MoneyCounts;
  ads: MoneyRow[];
  campaigns: MoneyRow[];
  /** Accounts with no campaign or ad tag at all. */
  untagged: MoneyCounts;
}

const zero = (): MoneyCounts => ({ signups: 0, trial: 0, paying: 0, lapsed: 0, other: 0 });
function tally(c: MoneyCounts, state: SignupState) {
  c.signups++;
  if (state === "trial") c.trial++;
  else if (state === "paying") c.paying++;
  else if (state === "lapsed") c.lapsed++;
  else c.other++;
}
/** Paying first, then trials, then sign-ups — the order money arrives in. */
const byMoney = (a: MoneyRow, b: MoneyRow) => b.paying - a.paying || b.trial - a.trial || b.signups - a.signups || a.name.localeCompare(b.name);

export function adMoney(signups: readonly MoneySignup[], opts: { since: string; adNames?: Record<string, string>; visits?: Record<string, number>; campaignVisits?: Record<string, number> }): AdMoney {
  const names = opts.adNames ?? {};
  const visits = opts.visits ?? {};
  const campaignVisits = opts.campaignVisits ?? {};
  const total = zero(), untagged = zero();
  const ads = new Map<string, MoneyRow>(), campaigns = new Map<string, MoneyRow>();
  for (const s of signups) {
    const campaign = s.campaign.trim(), content = s.content.trim();
    tally(total, s.state);
    if (!campaign && !content) { tally(untagged, s.state); continue; }
    const key = content || campaign;
    let ad = ads.get(key);
    if (!ad) { ad = { key, name: adNameOf({ utmCampaign: campaign, utmContent: content }, names), campaign, visits: visits[key] ?? null, ...zero() }; ads.set(key, ad); }
    tally(ad, s.state);
    if (campaign) {
      let c = campaigns.get(campaign);
      if (!c) { c = { key: campaign, name: names[campaign] ?? `campaign ${campaign}`, campaign: "", visits: campaignVisits[campaign] ?? null, ...zero() }; campaigns.set(campaign, c); }
      tally(c, s.state);
    }
  }
  return { since: opts.since, total, untagged, ads: [...ads.values()].sort(byMoney), campaigns: [...campaigns.values()].sort(byMoney) };
}
