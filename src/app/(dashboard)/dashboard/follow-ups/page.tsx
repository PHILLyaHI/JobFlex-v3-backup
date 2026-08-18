import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { isTwilioEnabled } from "@/lib/sdk/twilio";
import { parseChannel } from "@/lib/followUps/copy";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { FollowUpsClient } from "./follow-ups-client";

export default async function FollowUpsPage() {
  const { organizationId } = await requireOrg();

  const sinceWeek = new Date();
  sinceWeek.setDate(sinceWeek.getDate() - 7);

  const [rules, pending, completedThisWeek] = await Promise.all([
    db.followUpRule.findMany({ where: { organizationId }, orderBy: { name: "asc" } }),
    // `FollowUp` has no `proposal` relation — only a `proposalId` scalar — so
    // the titles come from a second lookup, the way the CRM pages do it. The
    // `include: { proposal }` this used to carry was hidden behind an `as any`
    // and threw at runtime on every render ("Unknown field `proposal` for
    // include statement on model `FollowUp`"), which is why the page 500'd.
    db.followUp.findMany({
      where: { organizationId, completedAt: null },
      orderBy: { runAt: "asc" },
      take: 20,
    }),
    db.followUp.count({
      where: { organizationId, completedAt: { gte: sinceWeek } },
    }),
  ]);

  // A rule's send copy is derived from its trigger now (src/lib/followUps/copy.ts),
  // so the only per-rule choice left is the channel — which is what the
  // `template` column carries.
  const ruleRows = rules.map((r) => ({
    id: r.id,
    name: r.name,
    triggerStatus: r.triggerStatus,
    delayMinutes: r.delayMinutes,
    enabled: r.enabled,
    channel: parseChannel(r.template),
  }));

  const proposalIds = Array.from(
    new Set(pending.map((p) => p.proposalId).filter((id): id is string => Boolean(id))),
  );
  const titleById = new Map(
    proposalIds.length
      ? (
          await db.proposal.findMany({
            where: { id: { in: proposalIds }, organizationId },
            select: { id: true, title: true },
          })
        ).map((p) => [p.id, p.title])
      : [],
  );

  const pendingRows = pending.map((p) => ({
    id: p.id,
    proposalTitle: p.proposalId ? (titleById.get(p.proposalId) ?? null) : null,
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
        smsEnabled={isTwilioEnabled()}
      />
    </>
  );
}
