import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { parseGmailSettings } from "@/lib/settings";
import { GmailForm } from "./gmail-form";

export default async function GmailSettingsPage() {
  const { organizationId } = await requireOrg();
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { gmailSettingsJson: true },
  });
  return <GmailForm initial={parseGmailSettings(org?.gmailSettingsJson)} />;
}
