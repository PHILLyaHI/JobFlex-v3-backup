// A fresh live report, sharing every part that did not change with the one on
// screen (2026-10-01). Fifteen-second polls mostly bring the same visitors:
// handing down the SAME objects lets the memoised map, platform cards and rows
// skip their render, and only what moved is drawn again.
import type { LiveReport } from "@/lib/traffic-live";

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** `next`'s list with `prev`'s objects wherever an item (by key) is unchanged;
 *  `prev` itself when nothing at all changed. */
function share<T>(prev: T[], next: T[], key: (x: T) => string): T[] {
  const old = new Map(prev.map((x) => [key(x), x]));
  let changed = prev.length !== next.length;
  const out = next.map((x, i) => {
    const o = old.get(key(x));
    if (o !== undefined && same(o, x)) { if (prev[i] !== o) changed = true; return o; }
    changed = true;
    return x;
  });
  return changed ? out : prev;
}

export function sameReport(prev: LiveReport, next: LiveReport): LiveReport {
  return {
    ...next,
    visitors: share(prev.visitors, next.visitors, (v) => v.id + v.firstAt),
    platforms: share(prev.platforms, next.platforms, (p) => p.platform),
    otherSignups: share(prev.otherSignups, next.otherSignups, (o) => o.orgName + o.at),
    counts: same(prev.counts, next.counts) ? prev.counts : next.counts,
    totals: same(prev.totals, next.totals) ? prev.totals : next.totals,
    today: same(prev.today, next.today) ? prev.today : next.today,
    adNames: same(prev.adNames, next.adNames) ? prev.adNames : next.adNames,
  };
}
