import { requireOrg } from "@/lib/orgContext";
import { loadTeamActivity } from "@/lib/teamActivity";
import { TeamActivity } from "@/components/company/TeamActivity";

export default async function CompanyActivityPage() {
  const { organizationId } = await requireOrg();
  const { activities, members } = await loadTeamActivity(organizationId);

  return <TeamActivity activities={activities} members={members} />;
}
