import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { ProposalsSettingsForm } from "./proposals-settings-form";

export default async function ProposalsSettingsPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { materialMarkupPct: true, laborMarkupPct: true },
  });
  return (
    <ProposalsSettingsForm
      initialMaterialMarkup={org?.materialMarkupPct ?? 0}
      initialLaborMarkup={org?.laborMarkupPct ?? 0}
    />
  );
}
