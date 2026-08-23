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
import { renderTemplate, type TemplateVars } from "@/lib/email/render";
import { renderEmail } from "@/lib/email/renderEmail";
import {
  buildProposalSent,
  buildProposalAccepted,
  formatUSD,
  isBareUrlParagraph,
} from "@/lib/email/build/client";
import {
  buildCrewResponse,
  buildLeadOffer,
  buildNewLead,
  buildOwnerAccepted,
} from "@/lib/email/build/operator";
import { buildAppointmentAssignment, buildJobAssignment } from "@/lib/email/build/worker";
import { buildRequestReceived, buildHomeownerMatched } from "@/lib/email/build/platform";
import { parseGmailSettings } from "@/lib/settings";

export { formatUSD };

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
      // No {{link}} line here on purpose — buildProposalSent's CTA button
      // already carries the portal link. A prose line repeating it would
      // render the same URL twice (Task 5 fix round 1, Finding A).
      return {
        subject: "Your proposal from {{org}}",
        body: `Hi {{client_name}},

Thanks for meeting with us. Here is the proposal we put together for your project — {{total}} in total.

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
      // No {{link}} line here either — same reasoning as proposal-send above.
      return {
        subject: "A quick nudge — {{title}}",
        body: `Hi {{client_name}},

Circling back on the proposal we sent. Any questions, just reply to this email.

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
      lineItems: { orderBy: { position: "asc" }, take: 13 },
      organization: {
        select: { name: true, billingEmail: true, gmailSettingsJson: true, logoUrl: true, phone: true },
      },
    },
  });
  if (!proposal) return { skipped: true as const, reason: "not-found" };
  if (!proposal.client?.email) return { skipped: true as const, reason: "no-client-email" };

  const tpl = await pickTemplate(proposal.organizationId, "proposal-send");
  const fallback = defaultBodyFor("proposal-send");
  const body = tpl?.body ?? fallback.body;

  const appUrl = await appBaseUrl();
  const vars: TemplateVars = {
    client_name: proposal.client.name,
    total: formatUSD(proposal.total),
    link: `${appUrl}/portal/q/${proposal.publicId}`,
    org: proposal.organization.name,
    title: proposal.title,
  };

  // Contractor keeps their own words (from the template body) — the system
  // supplies the structured box. Bare-URL-only paragraphs are dropped since
  // the CTA already carries the link.
  const prose = renderTemplate(body, vars)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter((p) => p && !isBareUrlParagraph(p));

  const { subject: subj, html } = renderEmail(
    buildProposalSent({
      org: {
        name: proposal.organization.name,
        logoUrl: proposal.organization.logoUrl,
        phone: proposal.organization.phone,
      },
      clientName: proposal.client.name,
      title: proposal.title,
      lineItems: proposal.lineItems.map((li) => ({ name: li.name, total: li.total })),
      taxRate: proposal.taxRate,
      taxTotal: proposal.taxTotal,
      total: proposal.total,
      validUntil: proposal.validUntil,
      href: `${appUrl}/portal/q/${proposal.publicId}`,
      prose,
    }),
  );

  const res = await sendEmail({
    to: proposal.client.email,
    subject: subj,
    html,
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
        select: { name: true, billingEmail: true, gmailSettingsJson: true, logoUrl: true, phone: true },
      },
    },
  });
  if (!proposal) return { skipped: true as const, reason: "not-found" };

  const appUrl = await appBaseUrl();
  const replyTo = replyToFor(proposal.organization);

  // 1) Thank-you to the client (customer-facing → reply-to the contractor).
  //    Client half only — the internal owner heads-up below is unchanged
  //    (moves onto a builder in Task 6).
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
    const prose = renderTemplate(tpl?.body ?? fallback.body, vars)
      .split(/\n{2,}/)
      .map((p) => p.replace(/\n/g, " ").trim())
      .filter((p) => p && !isBareUrlParagraph(p));

    const { subject: acceptedSubject, html: acceptedHtml } = renderEmail(
      buildProposalAccepted({
        org: {
          name: proposal.organization.name,
          logoUrl: proposal.organization.logoUrl,
          phone: proposal.organization.phone,
        },
        clientName: proposal.client.name,
        title: proposal.title,
        total: proposal.total,
        callByDate: null,
        prose,
      }),
    );
    await sendEmail({
      to: proposal.client.email,
      subject: acceptedSubject,
      html: acceptedHtml,
      replyTo,
    });
  }

  // 2) Internal heads-up to the owner (system → no contractor reply-to).
  if (proposal.organization.billingEmail) {
    const { subject: ownerSubject, html: ownerHtml } = renderEmail(
      buildOwnerAccepted({
        org: {
          name: proposal.organization.name,
          logoUrl: proposal.organization.logoUrl,
          phone: proposal.organization.phone,
        },
        clientName: proposal.client?.name ?? "A client",
        title: proposal.title,
        acceptedAt: new Date(),
        total: proposal.total,
        needsScheduling: true,
        href: `${appUrl}/dashboard/proposals/${proposal.id}`,
      }),
    );
    await sendEmail({
      to: proposal.organization.billingEmail,
      subject: ownerSubject,
      html: ownerHtml,
    });
  }

  return { skipped: false as const, enabled: isEmailEnabled() };
}

export async function notifyLeadCreated(leadId: string) {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    include: {
      organization: { select: { name: true, phone: true, billingEmail: true, logoUrl: true } },
    },
  });
  if (!lead || !lead.organization) return { skipped: true as const };

  const ownerEmail = lead.organization.billingEmail;
  if (ownerEmail) {
    const appUrl = await appBaseUrl();
    const { subject: leadSubject, html: leadHtml } = renderEmail(
      buildNewLead({
        org: {
          name: lead.organization.name,
          logoUrl: lead.organization.logoUrl,
          phone: lead.organization.phone,
        },
        leadName: lead.name,
        phone: lead.email ?? lead.phone ?? null,
        project: lead.projectType ?? null,
        source: lead.source ?? "Website",
        enquiry: lead.description ?? null,
        href: `${appUrl}/dashboard/leads`,
      }),
    );
    await sendEmail({ to: ownerEmail, subject: leadSubject, html: leadHtml });
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

/**
 * Staffed on an appointment — email the worker.
 *
 * The job path has notified since it shipped; the appointment path never did.
 * A manager could put someone on a site visit and the only trace the worker had
 * was a card appearing in a calendar they might not open that week. Called with
 * the ids that were ADDED (not the whole roster), so re-saving an appointment
 * does not re-mail everyone already on it.
 *
 * Best-effort by contract: the caller wraps it, because a mail failure must
 * never roll back a booking that is already in the calendar.
 */
export async function notifyAppointmentAssigned(appointmentId: string, workerIds: string[]) {
  if (!workerIds.length) return { skipped: true as const, reason: "no-workers" };

  const apt = await db.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      client: { select: { address: true } },
      lead: { select: { address: true } },
      organization: { select: { name: true, logoUrl: true, phone: true } },
    },
  });
  if (!apt) return { skipped: true as const, reason: "not-found" };

  const workers = await db.workerProfile.findMany({
    where: { id: { in: workerIds }, organizationId: apt.organizationId },
    select: { displayName: true, token: true, user: { select: { email: true } } },
  });

  const appUrl = await appBaseUrl();
  let sent = 0;
  for (const w of workers) {
    const email = w.user?.email;
    if (!email) continue;
    const { subject, html } = renderEmail(
      buildAppointmentAssignment({
        org: {
          name: apt.organization.name,
          logoUrl: apt.organization.logoUrl,
          phone: apt.organization.phone,
        },
        workerName: w.displayName,
        title: apt.title,
        startsAt: apt.startsAt,
        endsAt: apt.endsAt,
        address: apt.client?.address ?? apt.lead?.address ?? null,
        notes: apt.notes,
        href: `${appUrl}/w/${w.token}`,
      }),
    );
    await sendEmail({ to: email, subject, html });
    sent += 1;
  }
  return { skipped: false as const, sent };
}

export async function notifyAssignmentCreated(assignmentId: string) {
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      worker: { include: { user: { select: { email: true } } } },
      job: {
        select: {
          title: true,
          organizationId: true,
          startsAt: true,
          // Job itself has no address column — it lives on the client or,
          // failing that, the proposal the job was created from.
          client: { select: { address: true } },
          proposal: { select: { address: true } },
          // Sibling assignees for the Crew row; filtered to exclude this
          // recipient below (workerId is unique per assignment, not per row).
          assignments: {
            select: { workerId: true, worker: { select: { displayName: true } } },
          },
        },
      },
    },
  });
  if (!a) return { skipped: true as const };

  const email = a.worker.user?.email;
  if (email) {
    const appUrl = await appBaseUrl();
    const org = await db.organization.findUnique({
      where: { id: a.job.organizationId },
      select: { name: true, logoUrl: true, phone: true },
    });
    const crew = a.job.assignments
      .filter((x) => x.workerId !== a.workerId)
      .map((x) => x.worker.displayName);
    const { subject, html } = renderEmail(
      buildJobAssignment({
        org: { name: org?.name ?? "Your team", logoUrl: org?.logoUrl, phone: org?.phone },
        workerName: a.worker.displayName,
        title: a.job.title,
        startsAt: a.job.startsAt,
        address: a.job.client?.address ?? a.job.proposal?.address ?? null,
        crew,
        href: `${appUrl}/w/${a.worker.token}`,
      }),
    );
    await sendEmail({ to: email, subject, html });
  }

  if (a.worker.phone && isTwilioEnabled()) {
    await sendSMS(
      a.worker.phone,
      `JobFlex: you were assigned to "${a.job.title}". Open your portal to confirm.`,
    ).catch(() => null);
  }

  return { skipped: false as const };
}

/**
 * Crew answered an assignment (2026-08-22, owner request): the OFFICE hears it
 * by email — the org's owner(s) plus the manager who made the assignment
 * (recovered from the ASSIGNED activity row's meta; the assignment table
 * carries no assignedBy column). Recipients are deduped and the responding
 * worker's own address is excluded — answering your own mail is noise.
 */
export async function notifyAssignmentResponded(
  assignmentId: string,
  response: "ACCEPTED" | "DECLINED",
  jobStatusNow: string | null,
) {
  if (!isEmailEnabled()) return { skipped: true as const };
  const a = await db.jobAssignment.findUnique({
    where: { id: assignmentId },
    include: {
      worker: { include: { user: { select: { email: true } } } },
      job: { select: { id: true, title: true, startsAt: true, organizationId: true } },
    },
  });
  if (!a) return { skipped: true as const };
  const organizationId = a.job.organizationId;

  const [org, owners, assignedEvent] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, logoUrl: true, phone: true },
    }),
    db.membership.findMany({
      where: { organizationId, role: "OWNER" },
      select: { user: { select: { email: true } } },
    }),
    db.activityEvent.findFirst({
      where: { organizationId, kind: "ASSIGNED", meta: { contains: assignmentId } },
      orderBy: { createdAt: "desc" },
      select: { actor: { select: { email: true } } },
    }),
  ]);

  const workerEmail = a.worker.user?.email?.toLowerCase() ?? null;
  const to = Array.from(
    new Set(
      [...owners.map((m) => m.user?.email), assignedEvent?.actor?.email]
        .filter((e): e is string => Boolean(e))
        .map((e) => e.toLowerCase()),
    ),
  ).filter((e) => e !== workerEmail);
  if (to.length === 0) return { skipped: true as const };

  const appUrl = await appBaseUrl();
  const { subject, html } = renderEmail(
    buildCrewResponse({
      org: { name: org?.name ?? "Your team", logoUrl: org?.logoUrl, phone: org?.phone },
      workerName: a.worker.displayName,
      title: a.job.title,
      response,
      startsAt: a.job.startsAt,
      jobStatusNow,
      href: `${appUrl}/dashboard/jobs/${a.job.id}`,
    }),
  );
  await Promise.all(to.map((email) => sendEmail({ to: email, subject, html })));
  return { skipped: false as const };
}

// ── Lead Center ──────────────────────────────────────────────────────────────
// Platform-branded (no org exists on the lead yet, except once matched).

// Instant confirmation to the homeowner on submission. Email always; SMS when
// they left a phone number.
export async function notifyHomeownerRequestReceived(platformLeadId: string) {
  const pl = await db.platformLead.findUnique({ where: { id: platformLeadId } });
  if (!pl) return { skipped: true as const };

  const { subject, html } = renderEmail(
    buildRequestReceived({ name: pl.name, projectType: pl.projectType ?? null }),
  );
  await sendEmail({ to: pl.email, subject, html });

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
    const { subject: offerSubject, html: offerHtml } = renderEmail(
      buildLeadOffer({
        trade: pl.detectedTrade ?? pl.projectType ?? "project",
        where,
        createdAt: offer.createdAt,
        reservedHours: 24,
        nextShop: "the next shop in line",
        href: `${appUrl}/dashboard/leads`,
      }),
    );
    await sendEmail({
      to: offer.organization.billingEmail,
      subject: offerSubject,
      html: offerHtml,
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

  // Same smoothing input Lead Center ranking reads (src/lib/leadCenter/matching.ts)
  // collapsed to a display string — a shop with no completed reviews yet reads
  // "New" rather than a misleadingly precise 0.0.
  const ratingAgg = await db.reviewRequest.aggregate({
    where: { organizationId: pl.matchedOrgId, rating: { not: null } },
    _avg: { rating: true },
    _count: { rating: true },
  });
  const rating =
    ratingAgg._count.rating > 0 && ratingAgg._avg.rating != null
      ? ratingAgg._avg.rating.toFixed(1)
      : "New";

  const { subject, html } = renderEmail(
    buildHomeownerMatched({
      name: pl.name,
      orgName: org.name,
      phone: org.phone,
      rating,
      projectType: pl.detectedTrade ?? pl.projectType ?? null,
    }),
  );
  await sendEmail({
    to: pl.email,
    subject,
    html,
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
