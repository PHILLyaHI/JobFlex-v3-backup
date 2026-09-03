"use server";
import { fromMinor, resolveSchedule } from "@/lib/paymentSchedule";
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
      installments: { orderBy: { position: "asc" } },
    },
  });
  if (!proposal) return { skipped: true as const, reason: "not-found" };
  if (proposal.organizationId !== organizationId) {
    return { skipped: true as const, reason: "unauthorized" };
  }
  if (!proposal.client?.email) return { skipped: true as const, reason: "no-client-email" };

  // The schedule is the source of truth for what is owed: paid stages are
  // frozen, unpaid ones recompute, and the balance is total − paid.
  const schedule = resolveSchedule({
    total: proposal.total,
    currency: proposal.currency,
    installments: proposal.installments,
  });
  const installment = proposal.installments.find((i) => i.id === installmentId) ?? null;
  const stage = installment ? schedule.stages.find((s) => s.id === installment.id) : null;
  const dollars = stage ? fromMinor(stage.amountMinor) : fromMinor(schedule.remainingMinor);
  const label = installment?.label ?? (schedule.unpaidCount > 1 ? "Remaining balance" : "Payment");
  const paidToDate = fromMinor(schedule.paidMinor);

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
