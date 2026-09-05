import { requirePlatformAdmin } from "@/lib/orgContext";
import { getTrafficDashboard } from "@/actions/trafficDashboard";
import { AdminTrafficContent } from "@/components/v3/admin-traffic/admin-traffic-content";

export default async function AdminTrafficPage() {
  await requirePlatformAdmin();
  const data = await getTrafficDashboard();
  return <AdminTrafficContent data={data} />;
}
