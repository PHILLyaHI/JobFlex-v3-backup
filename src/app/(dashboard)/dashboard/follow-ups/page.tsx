import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { FollowUpsClient } from "./follow-ups-client";

export default async function FollowUpsPage() {
  const { organizationId } = await requireOrg();

  const sinceWeek = new Date();
  sinceWeek.setDate(sinceWeek.getDate() - 7);

  const [rules, templates, pending, completedThisWeek] = await Promise.all([
    db.followUpRule.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    db.emailTemplate.findMany({
      where: { organizationId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.followUp.findMany({
      where: { organizationId, completedAt: null },
      orderBy: { runAt: "asc" },
      include: { proposal: { select: { title: true } } } as any,
      take: 20,
    }),
    db.followUp.count({
      where: { organizationId, completedAt: { gte: sinceWeek } },
    }),
  ]);

  // Map template name per rule
  const tplById = new Map(templates.map((t) => [t.id, t.name]));

  const ruleRows = rules.map((r) => ({
    id: r.id,
    name: r.name,
    triggerStatus: r.triggerStatus,
    delayMinutes: r.delayMinutes,
    enabled: r.enabled,
    templateId: r.template ?? null,
    templateName: r.template ? tplById.get(r.template) ?? null : null,
  }));

  const pendingRows = pending.map((p: any) => ({
    id: p.id,
    proposalTitle: p.proposal?.title ?? null,
    runAt: p.runAt,
    note: p.note,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Automation"
        title="Follow-ups"
        description="Automated reminders that fire when a proposal hits a status and stays there. Rules queue → a daily CRON dispatches."
      />

      <StaggerGrid className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Active rules"
          value={String(rules.filter((r) => r.enabled).length)}
          hint={`${rules.length} total`}
        />
        <StatCard
          label="Pending dispatches"
          value={String(pendingRows.length)}
          hint="Queued to run"
        />
        <StatCard
          label="Sent this week"
          value={String(completedThisWeek)}
          hint="Last 7 days"
        />
      </StaggerGrid>

      <FollowUpsClient
        rules={ruleRows}
        pending={pendingRows}
        templates={templates}
      />
    </>
  );
}
