// Plain server module (NOT "use server") for outbound notifications. These
// senders take a bare proposalId / leadId / assignmentId and fire real emails +
// SMS (including a worker's /w/<token> magic link), so exposing them as "use
// server" actions turned them into unauthenticated spam/abuse endpoints. They
// now live here and are called only from already-guarded server actions / the
// signature-or-token-gated routes that own the resource. The one genuinely
// user-invoked sender (notifyPaymentReminder) stays a guarded action in
// src/actions/notify.ts.
import { db } from "@/lib/db";
import { appBaseUrl } from "@/lib/appUrl";
import { sendEmail, isEmailEnabled } from "@/lib/sdk/resend";
import { sendSMS, isTwilioEnabled } from "@/lib/sdk/twilio";
import { renderTemplate, wrapEmail, type TemplateVars } from "@/lib/email/render";
import { parseGmailSettings } from "@/lib/settings";

// Customer-facing mail sends from the platform address but routes replies to the
// contractor: their Gmail reply-to if set, else the org billing email.
export function replyToFor(org: {
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

  const appUrl = await appBaseUrl();
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

  const appUrl = await appBaseUrl();
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
    const appUrl = await appBaseUrl();
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

export function formatUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

// ── Lead Center ──────────────────────────────────────────────────────────────
// Platform-branded (no org exists on the lead yet, except once matched).

// Instant confirmation to the homeowner on submission. Email always; SMS when
// they left a phone number.
export async function notifyHomeownerRequestReceived(platformLeadId: string) {
  const pl = await db.platformLead.findUnique({ where: { id: platformLeadId } });
  if (!pl) return { skipped: true as const };

  const wrapped = wrapEmail({
    subject: "We got your request — matching you with a pro",
    body: `Hi ${pl.name.split(" ")[0]},

Thanks for telling us about your project${pl.projectType ? ` (${pl.projectType})` : ""}. We're matching you with a qualified local contractor now — expect to hear from one within 24 hours.

No need to do anything else; we'll email you as soon as you're matched.

— JobFlex`,
    orgName: "JobFlex",
  });
  await sendEmail({ to: pl.email, subject: wrapped.subject, html: wrapped.html });

  if (pl.phone && isTwilioEnabled()) {
    await sendSMS(
      pl.phone,
      `JobFlex: we got your ${pl.projectType ?? "project"} request. We're matching you with a local pro — you'll hear from one within 24 hours.`,
    ).catch(() => null);
  }
  return { skipped: false as const, enabled: isEmailEnabled() };
}

// Pings the offered org: email to billing email + optional SMS to org phone.
export async function notifyLeadOfferCreated(offerId: string) {
  const offer = await db.leadOffer.findUnique({
    where: { id: offerId },
    include: {
      platformLead: true,
      organization: { select: { name: true, billingEmail: true, phone: true } },
    },
  });
  if (!offer) return { skipped: true as const };

  const pl = offer.platformLead;
  const appUrl = await appBaseUrl();
  const where = [pl.city, pl.state].filter(Boolean).join(", ") || pl.zip || "your area";

  if (offer.organization.billingEmail) {
    const wrapped = wrapEmail({
      subject: `New lead for you — ${pl.detectedTrade ?? pl.projectType ?? "project"} in ${where}`,
      body: `A homeowner near you is looking for help:

Project: ${pl.detectedTrade ?? pl.projectType ?? "—"}
Where: ${where}
${pl.description ? `Details: ${pl.description.slice(0, 400)}` : ""}

This lead is reserved for you for 24 hours — accept it before it moves to the next shop.

Review the lead:
${appUrl}/dashboard/leads`,
      orgName: offer.organization.name,
    });
    await sendEmail({
      to: offer.organization.billingEmail,
      subject: wrapped.subject,
      html: wrapped.html,
    });
  }

  if (offer.organization.phone && isTwilioEnabled()) {
    await sendSMS(
      offer.organization.phone,
      `JobFlex: new ${pl.detectedTrade ?? "project"} lead in ${where}, reserved for you for 24h. Accept it in your Leads inbox.`,
    ).catch(() => null);
  }
  return { skipped: false as const, enabled: isEmailEnabled() };
}

// "You're matched" to the homeowner once a contractor accepts (or an admin
// assigns). Includes the shop's name and contact so they know who's calling.
export async function notifyHomeownerMatched(platformLeadId: string) {
  const pl = await db.platformLead.findUnique({ where: { id: platformLeadId } });
  if (!pl || !pl.matchedOrgId) return { skipped: true as const };
  const org = await db.organization.findUnique({
    where: { id: pl.matchedOrgId },
    select: { name: true, phone: true, billingEmail: true, gmailSettingsJson: true },
  });
  if (!org) return { skipped: true as const };

  const contactLine = [org.phone, org.billingEmail].filter(Boolean).join(" · ");
  const wrapped = wrapEmail({
    subject: `You're matched — ${org.name} will be in touch`,
    body: `Hi ${pl.name.split(" ")[0]},

Good news: ${org.name} has taken on your ${pl.detectedTrade ?? pl.projectType ?? "project"} request and will reach out shortly.
${contactLine ? `\nYou can also reach them directly: ${contactLine}\n` : ""}
— JobFlex`,
    orgName: org.name,
  });
  await sendEmail({
    to: pl.email,
    subject: wrapped.subject,
    html: wrapped.html,
    replyTo: replyToFor({ gmailSettingsJson: org.gmailSettingsJson, billingEmail: org.billingEmail }),
  });

  if (pl.phone && isTwilioEnabled()) {
    await sendSMS(
      pl.phone,
      `JobFlex: you're matched! ${org.name} will contact you about your ${pl.detectedTrade ?? "project"}${org.phone ? ` — or call them at ${org.phone}` : ""}.`,
    ).catch(() => null);
  }
  return { skipped: false as const, enabled: isEmailEnabled() };
}
