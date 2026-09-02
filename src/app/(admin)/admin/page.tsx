import { requirePlatformAdmin } from "@/lib/orgContext";
import { getAdminOverview } from "@/actions/adminStats";
import { AdminOverviewContent } from "@/components/v3/admin-overview/admin-overview-content";

export default async function AdminHome() {
  await requirePlatformAdmin();
  const data = await getAdminOverview();
  return <AdminOverviewContent data={data} />;
}
