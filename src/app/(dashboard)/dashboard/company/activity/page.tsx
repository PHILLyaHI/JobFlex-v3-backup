import { requireOrg } from "@/lib/orgContext";
import { loadTeamActivity } from "@/lib/teamActivity";
import { TeamActivity } from "@/components/company/TeamActivity";
import { customPageGate } from "@/components/v3/upgrade-gate/custom-page-gate";

export default async function CompanyActivityPage() {
  const gate = await customPageGate("company");
  if (gate) return gate;
  const { organizationId } = await requireOrg();
  const { activities, members } = await loadTeamActivity(organizationId);

  return <TeamActivity activities={activities} members={members} />;
}
