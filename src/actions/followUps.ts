"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManager, requireSalesOrManager } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { sendOrgEmail } from "@/lib/email/orgSend";
import { renderEmail } from "@/lib/email/renderEmail";
import { isTwilioEnabled, sendSMS } from "@/lib/sdk/twilio";
import {
  delayLabel,
  encodeChannel,
  encodeDispatch,
  followUpEmailDoc,
  followUpSmsText,
  parseChannel,
  parseDispatch,
} from "@/lib/followUps/copy";

const ruleInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  triggerStatus: z.string(),
  delayMinutes: z.number().min(1),
  enabled: z.boolean().default(true),
  /** EMAIL or TEXT. Stored in the `template` column — see
   *  src/lib/followUps/copy.ts for why that column carries the channel now. */
  channel: z.enum(["EMAIL", "TEXT"]).default("EMAIL"),
});

export async function upsertFollowUpRule(raw: unknown) {
  const { organizationId } = await requireManager();
  const data = ruleInput.parse(raw);

  // A rule can only promise what this deployment can actually deliver. Offering
  // TEXT in the editor is gated on the same flag, but the server is the one that
  // has to refuse — otherwise a rule quietly stops sending the day the number
  // is removed.
  if (data.channel === "TEXT" && !isTwilioEnabled()) {
    throw new Error("Texting needs a Twilio number — set one up on the Phone page.");
  }
  const channel = encodeChannel(data.channel);

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
        template: channel,
      },
    });
    revalidatePath("/dashboard/follow-ups");
    revalidatePath("/dashboard/crm");
    return { id: updated.id };
  }

  const created = await db.followUpRule.create({
    data: {
      organizationId,
      name: data.name,
      triggerStatus: data.triggerStatus,
      delayMinutes: data.delayMinutes,
      enabled: data.enabled,
      template: channel,
    },
  });
  revalidatePath("/dashboard/follow-ups");
  revalidatePath("/dashboard/crm");
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
        // The queued row has to survive the rule being edited or deleted before
        // it fires, so it carries its own copy of what to send and how.
        // `templateId` is a free-form String? with no foreign key — see
        // src/lib/followUps/copy.ts.
        templateId: encodeDispatch(parseChannel(r.template), r.triggerStatus),
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
  // Working the CRM queue is a sales activity; rule CRUD above stays manager-only.
  const { organizationId } = await requireSalesOrManager();
  const fu = await db.followUp.findUnique({ where: { id } });
  if (!fu || fu.organizationId !== organizationId) throw new Error("Not found");
  await dispatchOne(fu.id);
  revalidatePath("/dashboard/follow-ups");
  revalidatePath("/dashboard/crm/queue");
}

export async function markFollowUpDone(id: string) {
  const { organizationId } = await requireSalesOrManager();
  const fu = await db.followUp.findUnique({ where: { id } });
  if (!fu || fu.organizationId !== organizationId) throw new Error("Not found");
  if (fu.completedAt) return;
  await db.followUp.update({ where: { id }, data: { completedAt: new Date() } });
  revalidatePath("/dashboard/follow-ups");
  revalidatePath("/dashboard/crm/queue");
}

/** `scheduleFollowUpsFor` writes the delay into the note as "… + 2880m", which
 *  is the only record of how long the rule waited once the row is queued. The
 *  prose says it out loud ("we sent this over 2 days ago"), so it is read back
 *  here rather than guessed. A row from before this change, or a hand-made one,
 *  just gets the neutral fallback. */
function delayFromNote(note: string | null): string {
  const m = note ? /\+\s*(\d+)m\s*$/.exec(note) : null;
  return m ? delayLabel(Number(m[1])) : "a few days";
}

async function dispatchOne(id: string): Promise<boolean> {
  const fu = await db.followUp.findUnique({
    where: { id },
    include: {
      organization: { select: { name: true } },
    },
  });
  if (!fu) return false;

  // What to say and how to send it were both stamped onto the row when the rule
  // scheduled it, so editing or deleting the rule afterwards cannot change a
  // follow-up that is already in the queue.
  const { channel, trigger } = parseDispatch(fu.templateId);

  const proposal = fu.proposalId
    ? await db.proposal.findUnique({
        where: { id: fu.proposalId },
        include: {
          client: true,
          organization: {
            select: {
              name: true,
              gmailSettingsJson: true,
              gmailTokensJson: true,
              billingEmail: true,
              logoUrl: true,
              phone: true,
            },
          },
        },
      })
    : null;

  /** What actually left the building, for the activity log. */
  let outcome: { kind: "EMAIL" | "TEXT"; to: string } | null = null;

  if (proposal) {
    const appUrl = await appBaseUrl();
    const ctx = {
      orgName: proposal.organization.name,
      orgLogoUrl: proposal.organization.logoUrl,
      orgPhone: proposal.organization.phone,
      clientName: proposal.client?.name ?? "there",
      title: proposal.title,
      total: proposal.total,
      validUntil: proposal.validUntil,
      href: `${appUrl}/portal/q/${proposal.publicId}`,
      delayLabel: delayFromNote(fu.note),
    };

    // TEXT falls back to email when the number was removed after the rule was
    // written — a follow-up that goes nowhere is worse than one that arrives on
    // the other channel.
    const canText = channel === "TEXT" && isTwilioEnabled() && Boolean(proposal.client?.phone);

    if (canText && proposal.client?.phone) {
      const res = await sendSMS(proposal.client.phone, followUpSmsText(trigger ?? "SENT", ctx));
      if (!res.skipped) outcome = { kind: "TEXT", to: proposal.client.phone };
    } else if (proposal.client?.email) {
      const { subject: subj, html } = renderEmail(followUpEmailDoc(trigger ?? "SENT", ctx));
      // Sends via the org's connected Gmail when opted in, else Resend/SMTP with
      // the contractor as reply-to.
      await sendOrgEmail(proposal.organization, {
        to: proposal.client.email,
        subject: subj,
        html,
      });
      outcome = { kind: "EMAIL", to: proposal.client.email };
    }
  }

  await db.followUp.update({
    where: { id },
    data: { completedAt: new Date() },
  });

  await db.activityEvent.create({
    data: {
      organizationId: fu.organizationId,
      proposalId: fu.proposalId,
      kind: outcome?.kind ?? "EMAIL",
      summary: outcome
        ? `Follow-up ${outcome.kind === "TEXT" ? "texted" : "emailed"} to ${outcome.to}`
        : "Follow-up closed — no reachable contact",
    },
  });

  return true;
}
