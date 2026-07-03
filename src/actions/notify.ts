"use server";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/orgContext";
import { sendEmail, isEmailEnabled } from "@/lib/sdk/resend";
import { sendSMS, isTwilioEnabled } from "@/lib/sdk/twilio";
import { renderTemplate, wrapEmail, type TemplateVars } from "@/lib/email/render";
import { parseGmailSettings } from "@/lib/settings";

// Customer-facing mail sends from the platform address but routes replies to the
// contractor: their Gmail reply-to if set, else the org billing email.
function replyToFor(org: {
  gmailSettingsJson: string | null;
  billingEmail: string | null;
}): string | undefined {
  const rt = parseGmailSettings(org.gmailSettingsJson).replyTo?.trim();
  return rt || org.billingEmail || undefined;
}

interface NotifyProposalSentInput {
  proposalId: string;
}

// Uses an EmailTemplate matching the given category; falls back to a reasonable default body.
async function pickTemplate(organizationId: string, category: string) {
  return db.emailTemplate.findFirst({
    where: { organizationId, category },
    orderBy: { createdAt: "desc" },
  });
}

function defaultBodyFor(category: string): { subject: string; body: string } {
  switch (category) {
    case "proposal-send":
      return {
        subject: "Your proposal from {{org}}",
        body: `Hi {{client_name}},

Thanks for meeting with us. Here is the proposal we put together for your project — {{total}} in total.

View and accept online:
{{link}}

— {{org}}`,
      };
    case "thank-you":
      return {
        subject: "Thanks for accepting — {{org}}",
        body: `Hi {{client_name}},

We just saw your acceptance on {{title}} — thank you! We'll be in touch shortly to get the work scheduled.

— {{org}}`,
      };
    case "reminder":
      return {
        subject: "A quick nudge — {{title}}",
        body: `Hi {{client_name}},

Circling back on the proposal we sent. It's ready to review here:
{{link}}

Any questions, just reply to this email.

— {{org}}`,
      };
    default:
      return { subject: "A message from {{org}}", body: "Hi {{client_name}},\n\n" };
  }
}

export async function notifyProposalSent({ proposalId }: NotifyProposalSentInput) {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: true,
      organization: {
        select: { name: true, billingEmail: true, gmailSettingsJson: true },
      },
    },
  });
  if (!proposal) return { skipped: true as const, reason: "not-found" };
  if (!proposal.client?.email) return { skipped: true as const, reason: "no-client-email" };

  const tpl = await pickTemplate(proposal.organizationId, "proposal-send");
  const fallback = defaultBodyFor("proposal-send");
  const subject = tpl?.subject ?? fallback.subject;
  const body = tpl?.body ?? fallback.body;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const vars: TemplateVars = {
    client_name: proposal.client.name,
    total: formatUSD(proposal.total),
    link: `${appUrl}/portal/q/${proposal.publicId}`,
    org: proposal.organization.name,
    title: proposal.title,
  };

  const wrapped = wrapEmail({
    subject: renderTemplate(subject, vars),
    body: renderTemplate(body, vars),
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
    enabled: isEmailEnabled(),
  };
}

// Sent when a proposal is accepted (portal acceptance). Thanks the client from
// the platform address with the contractor as reply-to, and pings the owner so
// they know to schedule the work.
export async function notifyProposalAccepted({ proposalId }: { proposalId: string }) {
  const proposal = await db.proposal.findUnique({
    where: { id: proposalId },
    include: {
      client: true,
      organization: {
        select: { name: true, billingEmail: true, gmailSettingsJson: true },
      },
    },
  });
  if (!proposal) return { skipped: true as const, reason: "not-found" };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const replyTo = replyToFor(proposal.organization);

  // 1) Thank-you to the client (customer-facing → reply-to the contractor).
  if (proposal.client?.email) {
    const tpl = await pickTemplate(proposal.organizationId, "thank-you");
    const fallback = defaultBodyFor("thank-you");
    const vars: TemplateVars = {
      client_name: proposal.client.name,
      total: formatUSD(proposal.total),
      link: `${appUrl}/portal/q/${proposal.publicId}`,
      org: proposal.organization.name,
      title: proposal.title,
    };
    const wrapped = wrapEmail({
      subject: renderTemplate(tpl?.subject ?? fallback.subject, vars),
      body: renderTemplate(tpl?.body ?? fallback.body, vars),
      orgName: proposal.organization.name,
    });
    await sendEmail({
      to: proposal.client.email,
      subject: wrapped.subject,
      html: wrapped.html,
      replyTo,
    });
  }

  // 2) Internal heads-up to the owner (system → no contractor reply-to).
  if (proposal.organization.billingEmail) {
    const wrapped = wrapEmail({
      subject: `Accepted — ${proposal.title}`,
      body: `${proposal.client?.name ?? "A client"} just accepted "${proposal.title}" (${formatUSD(proposal.total)}).

Time to schedule the work — open it in JobFlex:
${appUrl}/dashboard/proposals/${proposal.id}`,
      orgName: proposal.organization.name,
    });
    await sendEmail({
      to: proposal.organization.billingEmail,
      subject: wrapped.subject,
      html: wrapped.html,
    });
  }

  return { skipped: false as const, enabled: isEmailEnabled() };
}

export async function notifyLeadCreated(leadId: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      organization: { select: { name: true, phone: true, billingEmail: true } },
    },
  });
  if (!lead || !lead.organization) return { skipped: true as const };

  const ownerEmail = lead.organization.billingEmail;
  if (ownerEmail) {
    const bodyFilled = `A new lead came in: ${lead.name} (${lead.email ?? lead.phone ?? "no contact"}).

Project: ${lead.projectType ?? "—"}
${lead.description ? `Details: ${lead.description.slice(0, 400)}` : ""}

Triage in JobFlex.`;
    const wrapped = wrapEmail({
      subject: `New lead — ${lead.name}`,
      body: bodyFilled,
      orgName: lead.organization.name,
    });
    await sendEmail({ to: ownerEmail, subject: wrapped.subject, html: wrapped.html });
  }

  // Optional SMS if owner phone is set
  if (lead.organization.phone && isTwilioEnabled()) {
    await sendSMS(
      lead.organization.phone,
      `New JobFlex lead: ${lead.name} — ${lead.projectType ?? "inquiry"}`,
    ).catch(() => null);
  }
  return { skipped: false as const };
}

export async function notifyAssignmentCreated(assignmentId: string) {
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      worker: { include: { user: { select: { email: true } } } },
      job: { select: { title: true, organizationId: true, startsAt: true } },
    },
  });
  if (!a) return { skipped: true as const };

  const email = a.worker.user?.email;
  if (email) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const org = await db.organization.findUnique({
      where: { id: a.job.organizationId },
      select: { name: true },
    });
    const wrapped = wrapEmail({
      subject: `New job assignment — ${a.job.title}`,
      body: `Hi ${a.worker.displayName.split(" ")[0]},

You have a new job assignment${a.job.startsAt ? ` on ${new Date(a.job.startsAt).toLocaleDateString()}` : ""}:

${a.job.title}

Open your portal to confirm or decline:
${appUrl}/w/${a.worker.token}

— ${org?.name ?? "Your team"}`,
      orgName: org?.name ?? "JobFlex",
    });
    await sendEmail({ to: email, subject: wrapped.subject, html: wrapped.html });
  }

  if (a.worker.phone && isTwilioEnabled()) {
    await sendSMS(
      a.worker.phone,
      `JobFlex: you were assigned to "${a.job.title}". Open your portal to confirm.`,
    ).catch(() => null);
  }

  return { skipped: false as const };
}

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}
