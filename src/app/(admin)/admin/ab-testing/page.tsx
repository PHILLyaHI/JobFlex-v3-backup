import { requirePlatformAdmin } from "@/lib/orgContext";
import { parseTrafficFilters } from "@/lib/traffic-query";
import { AdminExperimentsContent } from "@/components/v3/admin-traffic/admin-experiments-content";

export const metadata = { title: "A/B testing | JobFlex Admin" };

export default async function AdminExperimentsPage() {
  await requirePlatformAdmin();
  return <AdminExperimentsContent initialFilters={parseTrafficFilters({})} />;
}
