// The saved October 1 presentation uses today's authenticated analytics reads.
// Keep this adapter client-side: restoring a design must not restore old queries.
import { getLiveTraffic, getMapHistory } from "@/actions/trafficDashboard";
import { platformCards, type LiveReport, type MapSpan } from "@/lib/traffic-live";

export type LiveRange = "5m" | "30m" | "1d" | "7d" | "30d";
export const LIVE_RANGES: Array<[LiveRange, string]> = [["5m", "Last 5 minutes"], ["30m", "Last 30 minutes"], ["1d", "Last 24 hours"], ["7d", "Last 7 days"], ["30d", "Last 30 days"]];
const minutes: Record<LiveRange, MapSpan> = { "5m": 5, "30m": 30, "1d": 1440, "7d": 10080, "30d": 43200 };
export type RangeReport = LiveReport & { range: LiveRange; rangeTruncated?: boolean };

export async function readLiveRange(includeDevelopment: boolean, range: LiveRange, fast: boolean, fullHistory: boolean): Promise<RangeReport> {
  const [live, history] = await Promise.all([
    getLiveTraffic({ includeDevelopment, fast, fullHistory }),
    minutes[range] > 30 ? getMapHistory({ minutes: minutes[range], includeDevelopment, fullHistory }) : Promise.resolve(null),
  ]);
  if (range === "30m") return { ...live, range };
  const visitors = history ? history.visitors : live.visitors.filter(v => v.active);
  return {
    ...live, range, visitors,
    platforms: platformCards(visitors, []),
    adNames: { ...live.adNames, ...history?.adNames },
    status: history?.status ?? live.status,
    message: history?.message ?? live.message,
    stale: history?.stale ?? live.stale,
    rangeTruncated: history?.truncated,
  };
}
