import { requirePlatformAdmin } from "@/lib/orgContext";
import { getAdminTraffic } from "@/actions/adminStats";
import { AdminTrafficContent } from "@/components/v3/admin-traffic/admin-traffic-content";

export default async function AdminTrafficPage() {
  await requirePlatformAdmin();
  const data = await getAdminTraffic();
  return <AdminTrafficContent data={data} />;
}
