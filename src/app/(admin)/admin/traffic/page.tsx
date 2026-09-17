import { requirePlatformAdmin } from "@/lib/orgContext";
import { getSignupAttribution, getTrafficDashboard } from "@/actions/trafficDashboard";
import { AdminTrafficContent } from "@/components/v3/admin-traffic/admin-traffic-content";

export default async function AdminTrafficPage() {
  await requirePlatformAdmin();
  const [data, signups] = await Promise.all([getTrafficDashboard(), getSignupAttribution()]);
  return <AdminTrafficContent data={data} signups={signups} />;
}
