import { requirePlatformAdmin } from "@/lib/orgContext";
import { getLiveTraffic, getSignupAttribution, getSignupLedger, getTrafficDashboard } from "@/actions/trafficDashboard";
import { AdminTrafficContent } from "@/components/v3/admin-traffic/admin-traffic-content";

export default async function AdminTrafficPage() {
  await requirePlatformAdmin();
  const [data, signups, live, ledger] = await Promise.all([getTrafficDashboard(), getSignupAttribution(), getLiveTraffic(), getSignupLedger()]);
  return <AdminTrafficContent data={data} signups={signups} live={live} ledger={ledger} />;
}
