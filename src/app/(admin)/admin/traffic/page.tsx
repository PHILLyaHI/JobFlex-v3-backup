import { requirePlatformAdmin } from "@/lib/orgContext";
import { getLiveTraffic, getSignupAttribution, getTrafficDashboard } from "@/actions/trafficDashboard";
import { AdminTrafficContent } from "@/components/v3/admin-traffic/admin-traffic-content";

export default async function AdminTrafficPage() {
  await requirePlatformAdmin();
  const [data, signups, live] = await Promise.all([getTrafficDashboard(), getSignupAttribution(), getLiveTraffic()]);
  return <AdminTrafficContent data={data} signups={signups} live={live} />;
}
