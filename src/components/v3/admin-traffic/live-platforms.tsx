"use client";
// THE AD PLATFORMS, LIVE (2026-09-29, AVACO's "Your ad platforms" cards for
// the live window): one card per platform we run ads on — Facebook,
// Instagram, TikTok, X, Google — always, and any other platform that
// brought someone in the last half hour. Each card: who it brought, how
// many are on the site now, from ads or organic (a bar), signing up and
// signed up in the window, today's signups the database credits to it, and
// the campaigns and ads seen — so when the ads run, every platform and
// every ad is told apart at a glance. A card is a filter: pressed, the map
// and the list below keep only that platform's people.
import { memo } from "react";
import type { LivePlatform } from "@/lib/traffic-live";
import s from "./traffic.module.css";

/** A stable empty default, so the memo is not broken by a fresh {} each render. */
const EMPTY_NAMES: Record<string, string> = {};
/** Memoised (2026-10-01): a refresh with the same platforms hands down the same array (live-diff), and the cards skip their render. */
export const LivePlatforms = memo(function LivePlatforms({ platforms, selected, onSelect, adNames = EMPTY_NAMES }: { platforms: LivePlatform[]; selected: string | null; onSelect: (key: string | null) => void; adNames?: Record<string, string> }) {
  const rate = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
  // A platform with nobody in the window and no signup today has nothing to
  // say, and five such cards — each three zeros deep — were most of the
  // screen (2026-10-01). They fold into one line underneath, still nameable,
  // still pressable the moment they have someone. A selected card always
  // shows, or pressing it would make it vanish.
  const busy = platforms.filter((p) => p.visitors > 0 || p.signedUpToday > 0 || p.platform === selected);
  // When nothing is happening anywhere, keeping one card back just to have a
  // card leaves a column of zeros on screen; the folded line below says it
  // in one sentence instead.
  const shown = busy;
  const folded = platforms.filter((p) => !shown.includes(p));
  return (
    <div className={s.platforms} role="group" aria-label="Where they come from, by platform">
      {shown.map((p) => (
        <button key={p.platform} type="button" className={s.platform} style={{ "--platform": p.colour } as React.CSSProperties} aria-pressed={selected === p.platform} onClick={() => onSelect(selected === p.platform ? null : p.platform)} data-platform={p.platform} data-ads={p.ads} title={selected === p.platform ? "Show everyone again" : `Keep only ${p.name}`}>
          <span className={s.platformName}><i aria-hidden="true"/>{p.name}{p.ads && <em>ads</em>}</span>
          <strong className={s.platformCount}>{p.visitors}<small>{p.onSite ? ` · ${p.onSite} on now` : ""}</small></strong>
          <span className={s.platformSplit}><b>{p.fromAds}</b> from ads · {p.organic} organic</span>
          <span className={s.platformBar} role="img" aria-label={`${p.fromAds} from ads, ${p.organic} organic`}>
            <i style={{ width: `${p.visitors ? (p.fromAds / p.visitors) * 100 : 0}%` }}/>
            <i style={{ width: `${p.visitors ? (p.organic / p.visitors) * 100 : 0}%`, opacity: 0.35 }}/>
          </span>
          <span className={s.platformOutcomes}>
            <span><small>Signing up</small><b>{p.signingUp}</b><small>{rate(p.signingUp, p.visitors)}</small></span>
            <span data-tone="ok"><small>Signed up</small><b>{p.signedUp}</b><small>{rate(p.signedUp, p.visitors)}</small></span>
            <span data-tone="today"><small>Today</small><b>{p.signedUpToday}</b><small>signups</small></span>
          </span>
          {p.campaigns.length > 0 ? (
            <span className={s.platformCampaigns}>
              {p.campaigns.map((c) => <span key={`${c.campaign}|${c.content}`}><b>{adNames[c.campaign] || c.campaign || "untagged"}</b>{c.content ? ` · ${adNames[c.content] || c.content}` : ""} · {c.visitors}{c.signedUp ? ` · ${c.signedUp} signed up` : ""}</span>)}
            </span>
          ) : (
            <span className={s.platformCampaigns}><span>{p.visitors ? "No campaign tag on these visits" : p.ads ? "Nobody yet — tag the ads with the links below" : ""}</span></span>
          )}
        </button>
      ))}
      {folded.length > 0 && (
        <p className={s.platformsQuiet}>
          <span>Nothing yet from</span>
          {folded.map((p) => (
            <button key={p.platform} type="button" style={{ "--platform": p.colour } as React.CSSProperties} onClick={() => onSelect(p.platform)} title={`Keep only ${p.name}`}>
              <i aria-hidden="true"/>{p.name}
            </button>
          ))}
          <span>{folded.some((p) => p.ads) ? "— tag those ads with the links below and they will name themselves here." : ""}</span>
        </p>
      )}
    </div>
  );
});
