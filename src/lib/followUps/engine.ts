// Follow-up scheduling + dispatch engine. Plain server module — NOT a
// "use server" file. These used to be exported from src/actions/followUps.ts,
// which made them public POST endpoints: anyone holding a proposal id could
// enqueue follow-up email/SMS to that org's client and fire the dispatcher
// without the cron secret. Only server code (proposal status changes, the
// cron route, the CRM "send now" action) may call these.
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { sendOrgEmail } from "@/lib/email/orgSend";
import { renderEmail } from "@/lib/email/renderEmail";
import { isTwilioEnabled, sendSMS } from "@/lib/sdk/twilio";
import {
  delayLabel,
  encodeDispatch,
  followUpEmailDoc,
  followUpSmsText,
  parseChannel,
  parseDispatch,
} from "@/lib/followUps/copy";

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

/** `scheduleFollowUpsFor` writes the delay into the note as "… + 2880m", which
 *  is the only record of how long the rule waited once the row is queued. The
 *  prose says it out loud ("we sent this over 2 days ago"), so it is read back
 *  here rather than guessed. A row from before this change, or a hand-made one,
 *  just gets the neutral fallback. */
function delayFromNote(note: string | null): string {
  const m = note ? /\+\s*(\d+)m\s*$/.exec(note) : null;
  return m ? delayLabel(Number(m[1])) : "a few days";
}

export async function dispatchOne(id: string): Promise<boolean> {
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
