import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { FollowUpRulesEditor, type RuleRow } from "@/components/crm/FollowUpRulesEditor";

export default async function WorkflowsPage() {
  const { organizationId } = await requireOrg();
  const rules = await db.followUpRule.findMany({
    where: { organizationId },
    orderBy: { name: "asc" },
  });

  const rows: RuleRow[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    triggerStatus: r.triggerStatus,
    delayMinutes: r.delayMinutes,
    enabled: r.enabled,
    template: r.template,
  }));

  return <FollowUpRulesEditor rules={rows} />;
}
