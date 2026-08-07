"use server";
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { requireManager } from "@/lib/orgContext";
import { sendEmail } from "@/lib/sdk/resend";
import { renderEmail } from "@/lib/email/renderEmail";
import { buildPaymentReminder } from "@/lib/email/build/client";
import { replyToFor } from "@/lib/notify";

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
        select: { name: true, billingEmail: true, gmailSettingsJson: true, logoUrl: true, phone: true },
      },
      installments: { where: { id: installmentId } },
      payments: { where: { status: "PAID" }, select: { amount: true } },
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
  const label = installment?.label ?? "Payment";
  const paidToDate = proposal.payments.reduce((sum, p) => sum + p.amount, 0);

  const appUrl = await appBaseUrl();
  const { subject, html } = renderEmail(
    buildPaymentReminder({
      org: {
        name: proposal.organization.name,
        logoUrl: proposal.organization.logoUrl,
        phone: proposal.organization.phone,
      },
      clientName: proposal.client.name,
      title: proposal.title,
      agreedTotal: proposal.total,
      paidToDate,
      dueNow: dollars,
      dueLabel: label,
      dueDate: installment?.dueDate ?? null,
      href: `${appUrl}/portal/q/${proposal.publicId}`,
    }),
  );

  const res = await sendEmail({
    to: proposal.client.email,
    subject,
    html,
    replyTo: replyToFor(proposal.organization),
  });

  return {
    skipped: false as const,
    delivery: res.skipped ? "disabled" : "sent",
  };
}
