import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { FollowUpRulesEditor, type RuleRow } from "@/components/crm/FollowUpRulesEditor";

export default async function WorkflowsPage() {
  const { organizationId } = await requireOrg();
  const [rules, templates] = await Promise.all([
    db.followUpRule.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    db.emailTemplate.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, subject: true, body: true },
    }),
  ]);

  const rows: RuleRow[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    triggerStatus: r.triggerStatus,
    delayMinutes: r.delayMinutes,
    enabled: r.enabled,
    template: r.template,
  }));

  return <FollowUpRulesEditor rules={rows} templates={templates} />;
}
