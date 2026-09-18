import { requirePlatformAdmin } from "@/lib/orgContext";
import { getAdminOverview } from "@/actions/adminStats";
import { readIntegrationsHealth } from "@/lib/integrationsHealth";
import { AdminOverviewContent } from "@/components/v3/admin-overview/admin-overview-content";

export default async function AdminHome() {
  await requirePlatformAdmin();
  // The stored health report, read not run: the page must not wait on seven
  // services, and a check on every page load would be a check nobody asked for.
  const [data, health] = await Promise.all([getAdminOverview(), readIntegrationsHealth()]);
  return <AdminOverviewContent data={data} health={health} />;
}
