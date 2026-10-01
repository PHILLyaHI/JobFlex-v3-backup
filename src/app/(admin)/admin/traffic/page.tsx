import { requirePlatformAdmin } from "@/lib/orgContext";
import { getLiveTraffic, getSignupAttribution, getSignupLedger, getTrafficDashboard } from "@/actions/trafficDashboard";
import { AdminTrafficContent } from "@/components/v3/admin-traffic/admin-traffic-content";
import { emptyTrafficReport } from "@/lib/traffic-server";
import { parseTrafficFilters } from "@/lib/traffic-query";

/** How long the page waits for the PostHog report before it paints without
 *  it (2026-10-01). A warm report (the server's cache) is ready in a few
 *  milliseconds and is rendered in place; a cold one takes 5–10 s of PostHog
 *  queries, and the page no longer waits for them: the live view, the
 *  signups and the header (from the live totals) paint at once and the
 *  report arrives in the browser — the same in-flight queries, not new ones. */
const REPORT_WAIT_MS = 400;

export default async function AdminTrafficPage() {
  await requirePlatformAdmin();
  const report = getTrafficDashboard();
  report.catch(() => undefined);
  const [signups, live, ledger] = await Promise.all([getSignupAttribution(), getLiveTraffic(), getSignupLedger()]);
  const ready = await Promise.race([report, new Promise<null>((r) => setTimeout(() => r(null), REPORT_WAIT_MS))]).catch(() => null);
  const data = ready ?? emptyTrafficReport(parseTrafficFilters({}));
  return <AdminTrafficContent data={data} deferred={!ready} signups={signups} live={live} ledger={ledger} />;
}
