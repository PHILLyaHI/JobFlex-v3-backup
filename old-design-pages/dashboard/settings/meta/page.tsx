import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parseMetaSettings } from "@/lib/settings";
import { MetaForm } from "./meta-form";

export default async function MetaSettingsPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { metaSettingsJson: true },
  });
  return <MetaForm initial={parseMetaSettings(org?.metaSettingsJson)} />;
}
