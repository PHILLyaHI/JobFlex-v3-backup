"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/sdk/resend";
import { renderTemplate, wrapEmail } from "@/lib/email/render";

const ruleInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  triggerStatus: z.string(),
  delayMinutes: z.number().min(1),
  enabled: z.boolean().default(true),
  templateId: z.string().nullable().optional(),
});

export async function upsertFollowUpRule(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = ruleInput.parse(raw);

  if (data.id) {
    const existing = await db.followUpRule.findUnique({ where: { id: data.id } });
    if (!existing || existing.organizationId !== organizationId) throw new Error("Not found");
    const updated = await db.followUpRule.update({
      where: { id: data.id },
      data: {
        name: data.name,
        triggerStatus: data.triggerStatus,
        delayMinutes: data.delayMinutes,
        enabled: data.enabled,
        template: data.templateId ?? null,
      },
    });
    revalidatePath("/dashboard/follow-ups");
    return { id: updated.id };
  }

  const created = await db.followUpRule.create({
    data: {
      organizationId,
      name: data.name,
      triggerStatus: data.triggerStatus,
      delayMinutes: data.delayMinutes,
      enabled: data.enabled,
      template: data.templateId ?? null,
    },
  });
  revalidatePath("/dashboard/follow-ups");
  return { id: created.id };
}

export async function setFollowUpRuleEnabled(id: string, enabled: boolean) {
  const { organizationId } = await requireManager();
  const rule = await db.followUpRule.findUnique({ where: { id } });
  if (!rule || rule.organizationId !== organizationId) throw new Error("Not found");
  await db.followUpRule.update({ where: { id }, data: { enabled } });
  revalidatePath("/dashboard/follow-ups");
}

export async function deleteFollowUpRule(id: string) {
  const { organizationId } = await requireManager();
  const rule = await db.followUpRule.findUnique({ where: { id } });
  if (!rule || rule.organizationId !== organizationId) throw new Error("Not found");
  await db.followUpRule.delete({ where: { id } });
  revalidatePath("/dashboard/follow-ups");
}

// Called from sendProposal / updateProposalStatus when a status changes — schedules any matching rule.
export async function scheduleFollowUpsFor(proposalId: string, newStatus: string) {
  const proposal = await db.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) return { scheduled: 0 };

  const rules = await db.followUpRule.findMany({
    where: {
      organizationId: proposal.organizationId,
      triggerStatus: newStatus,
      enabled: true,
    },
  });

  let scheduled = 0;
  for (const r of rules) {
    const runAt = new Date(Date.now() + r.delayMinutes * 60 * 1000);
    await db.followUp.create({
      data: {
        organizationId: proposal.organizationId,
        proposalId: proposal.id,
        runAt,
        note: `${r.name} · ${r.triggerStatus} + ${r.delayMinutes}m`,
      },
    });
    scheduled++;
  }
  return { scheduled };
}

// Cron: dispatch any follow-ups whose runAt is in the past.
export async function runDueFollowUps(): Promise<{ processed: number; delivered: number }> {
  const due = await db.followUp.findMany({
    where: { completedAt: null, runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: 50,
  });

  let delivered = 0;
  for (const fu of due) {
    const delivered_ = await dispatchOne(fu.id).catch(() => false);
    if (delivered_) delivered++;
  }
  return { processed: due.length, delivered };
}

export async function runFollowUpNow(id: string) {
  const { organizationId } = await requireManager();
  const fu = await db.followUp.findUnique({ where: { id } });
  if (!fu || fu.organizationId !== organizationId) throw new Error("Not found");
  await dispatchOne(fu.id);
  revalidatePath("/dashboard/follow-ups");
  revalidatePath("/dashboard/crm/queue");
}

export async function markFollowUpDone(id: string) {
  const { organizationId } = await requireManager();
  const fu = await db.followUp.findUnique({ where: { id } });
  if (!fu || fu.organizationId !== organizationId) throw new Error("Not found");
  if (fu.completedAt) return;
  await db.followUp.update({ where: { id }, data: { completedAt: new Date() } });
  revalidatePath("/dashboard/follow-ups");
  revalidatePath("/dashboard/crm/queue");
}

async function dispatchOne(id: string): Promise<boolean> {
  const fu = await db.followUp.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true } },
    },
  });
  if (!fu) return false;

  // Find the matching rule to locate the template (if any)
  const proposal = fu.proposalId
    ? await db.proposal.findUnique({
        where: { id: fu.proposalId },
        include: { client: true, organization: { select: { name: true } } },
      })
    : null;

  if (proposal?.client?.email) {
    // If the rule has a template, use it. Otherwise, default "reminder".
    const tpl = await db.emailTemplate.findFirst({
      where: { organizationId: fu.organizationId, category: "reminder" },
    });
    const subject = tpl?.subject ?? "A quick nudge — {{title}}";
    const body =
      tpl?.body ??
      `Hi {{client_name}},\n\nCircling back on our recent proposal. Review and accept online:\n{{link}}\n\n— {{org}}`;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const vars = {
      client_name: proposal.client.name,
      total: String(proposal.total),
      link: `${appUrl}/portal/q/${proposal.publicId}`,
      org: proposal.organization.name,
      title: proposal.title,
    };
    const wrapped = wrapEmail({
      subject: renderTemplate(subject, vars),
      body: renderTemplate(body, vars),
      orgName: proposal.organization.name,
    });
    await sendEmail({
      to: proposal.client.email,
      subject: wrapped.subject,
      html: wrapped.html,
    });
  }

  await db.followUp.update({
    where: { id },
    data: { completedAt: new Date() },
  });

  await db.activityEvent.create({
    data: {
      organizationId: fu.organizationId,
      proposalId: fu.proposalId,
      kind: "EMAIL",
      summary: "Follow-up dispatched",
    },
  });

  return true;
}
