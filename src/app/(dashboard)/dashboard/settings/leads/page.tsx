import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parseLeadsSettings } from "@/lib/settings";
import { LeadsSettingsForm } from "./leads-settings-form";

export default async function LeadsSettingsPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { leadsSettingsJson: true },
  });
  return <LeadsSettingsForm initial={parseLeadsSettings(org?.leadsSettingsJson)} />;
}
