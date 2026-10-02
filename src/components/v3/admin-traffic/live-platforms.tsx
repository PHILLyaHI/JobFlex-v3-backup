"use client";
// VISITOR SOURCES (2026-09-29, AVACO's "Your ad platforms" cards; simplified
// 2026-10-01): one card per platform over the chosen range, most people
// first — every ad platform even at zero. Each card: the platform's mark, the
// people it brought (and how many are on the site now), ads against organic,
// and the signups the database credits to it over the same range. A card is
// a filter: pressed, the map keeps only that platform's people.
import { memo } from "react";
import type { LivePlatform } from "@/lib/traffic-live";
import { PlatformLogo } from "./platform-logo";
import s from "./traffic.module.css";

/** Memoised: a refresh with the same platforms hands down the same array (live-diff), and the cards skip their render. */
export const LivePlatforms = memo(function LivePlatforms({ platforms, selected, onSelect }: { platforms: LivePlatform[]; selected: string | null; onSelect: (key: string | null) => void }) {
  return (
    <div className={s.platforms} role="group" aria-label="Visitor sources">
      {platforms.map((p) => (
        <button key={p.platform} type="button" className={s.platform} style={{ "--platform": p.colour } as React.CSSProperties} aria-pressed={selected === p.platform} onClick={() => onSelect(selected === p.platform ? null : p.platform)} data-platform={p.platform} data-empty={p.visitors === 0} title={selected === p.platform ? "Show everyone again" : `Show only ${p.name} on the map`}>
          <span className={s.platformName}><PlatformLogo platform={p.platform} className={s.platformLogo} dotClassName={s.platformDot}/>{p.name}</span>
          <span className={s.platformCount}><strong>{p.visitors.toLocaleString("en-US")}</strong>{p.onSite > 0 && <small>{p.onSite} on now</small>}</span>
          <span className={s.platformBar} role="img" aria-label={`${p.fromAds} from ads, ${p.organic} organic`}>
            <i style={{ width: `${p.visitors ? (p.fromAds / p.visitors) * 100 : 0}%` }}/>
          </span>
          <span className={s.platformSplit}><b>{p.fromAds.toLocaleString("en-US")}</b> ads · <b>{p.organic.toLocaleString("en-US")}</b> organic</span>
          <span className={s.platformSigned}><span>Signed up</span><b>{p.signedUp.toLocaleString("en-US")}</b></span>
        </button>
      ))}
    </div>
  );
});
