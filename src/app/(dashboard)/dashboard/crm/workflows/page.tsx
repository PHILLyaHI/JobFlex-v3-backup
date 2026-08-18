import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isTwilioEnabled } from "@/lib/sdk/twilio";
import { parseChannel } from "@/lib/followUps/copy";
import { FollowUpRulesEditor, type RuleRow } from "@/components/crm/FollowUpRulesEditor";

export default async function WorkflowsPage() {
  const { organizationId } = await requireOrg();
  const rules = await db.followUpRule.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });

  // No EmailTemplate lookup any more: a rule's wording is derived from its
  // trigger (src/lib/followUps/copy.ts) and the `template` column carries the
  // send channel instead.
  const rows: RuleRow[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    triggerStatus: r.triggerStatus,
    delayMinutes: r.delayMinutes,
    enabled: r.enabled,
    channel: parseChannel(r.template),
  }));

  return <FollowUpRulesEditor rules={rows} smsEnabled={isTwilioEnabled()} />;
}
