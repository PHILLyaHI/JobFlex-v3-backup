"use server";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { requireManager } from "@/lib/orgContext";
import { sendEmail } from "@/lib/sdk/resend";
import { wrapEmail } from "@/lib/email/render";
import { replyToFor, formatUSD } from "@/lib/notify";

// The customer/worker-facing senders (notifyProposalSent / Accepted /
// LeadCreated / AssignmentCreated) used to live here as "use server" exports —
// unauthenticated endpoints that fired real emails + SMS (including a worker's
// /w/<token> magic link) from any known cuid. They now live in src/lib/notify.ts
// (plain module, not invokable as actions) and are called only from the guarded
// actions / token-gated routes that own the resource. Only notifyPaymentReminder
// is genuinely user-triggered, so it stays a guarded action here.

export async function notifyPaymentReminder({
  proposalId,
  installmentId,
}: {
  proposalId: string;
  installmentId: string;
}) {
  const { organizationId } = await requireManager();
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: true,
      organization: {
        select: { name: true, billingEmail: true, gmailSettingsJson: true },
      },
      installments: { where: { id: installmentId } },
    },
  });
  if (!proposal) return { skipped: true as const, reason: "not-found" };
  if (proposal.organizationId !== organizationId) {
    return { skipped: true as const, reason: "unauthorized" };
  }
  if (!proposal.client?.email) return { skipped: true as const, reason: "no-client-email" };

  const installment = proposal.installments[0];
  const dollars = installment
    ? installment.isPercent
      ? proposal.total * (installment.amount / 100)
      : installment.amount
    : proposal.total;
  const label = installment?.label ?? "payment";

  const appUrl = await appBaseUrl();
  const wrapped = wrapEmail({
    subject: `Payment reminder — ${label} for ${proposal.title}`,
    body: `Hi ${proposal.client.name},

This is a reminder that your ${label} of ${formatUSD(dollars)} is due for ${proposal.title}.

You can view your proposal and payment details here:
${appUrl}/portal/q/${proposal.publicId}

— ${proposal.organization.name}`,
    orgName: proposal.organization.name,
  });

  const res = await sendEmail({
    to: proposal.client.email,
    subject: wrapped.subject,
    html: wrapped.html,
    replyTo: replyToFor(proposal.organization),
  });

  return {
    skipped: false as const,
    delivery: res.skipped ? "disabled" : "sent",
  };
}
