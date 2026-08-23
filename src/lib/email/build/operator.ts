// Pure (record) → EmailDoc builders for the four operator-facing emails. No
// I/O, so the gallery can render them from fixtures and the senders stay
// thin. Voice: work item, not a message — NO greeting, NO sign-off
// (principle 19, operator altitude). Trade jargon and internal IDs are
// welcome here; this is the opposite of client.ts's letter voice.
import type { BoxRow, EmailDoc, Lockup } from "../doc";
import { truncate } from "../fit";
import { formatUSD, type OrgBrand } from "./client";

const TITLE_MAX = 70;

const PLATFORM_LOCKUP: Lockup = { kind: "platform" };

function orgLockup(org: OrgBrand): Lockup {
  return { kind: "org", name: org.name, logoUrl: org.logoUrl ?? null };
}

function orgFooter(org: OrgBrand) {
  return { name: org.name, contact: org.phone ?? undefined };
}

function shortDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(d);
}

/** Reservation remaining as HH:MM. Clamps at 00:00 — never renders negative. */
export function countdown(from: Date, hours: number): string {
  const msLeft = from.getTime() + hours * 3_600_000 - Date.now();
  if (msLeft <= 0) return "00:00";
  const h = Math.floor(msLeft / 3_600_000);
  const m = Math.floor((msLeft % 3_600_000) / 60_000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface OwnerAcceptedInput {
  org: OrgBrand;
  clientName: string;
  title: string;
  acceptedAt: Date;
  total: number;
  needsScheduling: boolean;
  href: string;
}

/** Link, not CTA — there is nothing to do but know it (principle 06·a). */
export function buildOwnerAccepted(i: OwnerAcceptedInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "field", label: "Job", value: truncate(i.title, TITLE_MAX) },
    { type: "field", label: "Accepted", value: shortDate(i.acceptedAt) },
    { type: "anchor", label: "Value", value: formatUSD(i.total) },
  ];
  if (i.needsScheduling) {
    box.push({ type: "cond", label: "Needs scheduling", chip: "Now", tone: "warn" });
  }
  return {
    subject: `Accepted — ${i.title}`,
    lockup: orgLockup(i.org),
    kicker: { text: "Won", tone: "ok" },
    headline: `${i.clientName} accepted`,
    box,
    link: { label: "Open proposal", href: i.href },
    footer: orgFooter(i.org),
  };
}

export interface CrewResponseInput {
  org: OrgBrand;
  workerName: string;
  title: string;
  response: "ACCEPTED" | "DECLINED";
  startsAt: Date | null;
  /** What the response did to the job — "Scheduled" / "Canceled" / null when
   *  nothing changed (other crew still on it). */
  jobStatusNow: string | null;
  href: string;
}

/** Crew answered an assignment (2026-08-22). Link, not CTA on an accept —
 *  nothing to do but know it; a DECLINE carries a warn chip because the work
 *  now needs someone else. */
export function buildCrewResponse(i: CrewResponseInput): EmailDoc {
  const accepted = i.response === "ACCEPTED";
  const box: BoxRow[] = [
    { type: "field", label: "Job", value: truncate(i.title, TITLE_MAX) },
    { type: "field", label: "Crew", value: i.workerName },
    { type: "anchor", label: "Starts", value: i.startsAt ? shortDate(i.startsAt) : "TBD" },
  ];
  if (i.jobStatusNow) {
    box.push({
      type: "cond",
      label: "Job status",
      chip: i.jobStatusNow,
      tone: accepted ? "ok" : "warn",
    });
  }
  if (!accepted) {
    box.push({ type: "cond", label: "Needs crew", chip: "Reassign", tone: "warn" });
  }
  return {
    subject: `${accepted ? "Accepted" : "Declined"} — ${truncate(i.title, TITLE_MAX)}`,
    lockup: orgLockup(i.org),
    kicker: accepted ? { text: "Confirmed", tone: "ok" } : { text: "Declined", tone: "warn" },
    headline: `${i.workerName} ${accepted ? "accepted" : "declined"} the job`,
    box,
    link: { label: "Open job", href: i.href },
    footer: orgFooter(i.org),
  };
}

export interface NewLeadInput {
  org: OrgBrand;
  leadName: string;
  phone: string | null;
  project: string | null;
  source: string;
  enquiry?: string | null;
  href: string;
}

export function buildNewLead(i: NewLeadInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "field", label: "Phone", value: i.phone ?? "—" },
    { type: "field", label: "Project", value: i.project ?? "—" },
    { type: "field", label: "Source", value: i.source },
    { type: "cond", label: "Call within", chip: "1 hour", tone: "warn" },
  ];
  return {
    subject: `New lead — ${i.leadName}`,
    lockup: orgLockup(i.org),
    kicker: { text: "Lead" },
    headline: i.leadName,
    box,
    after: i.enquiry ? [`"${truncate(i.enquiry, 400)}"`] : undefined,
    cta: { label: "Open lead", href: i.href },
    footer: orgFooter(i.org),
  };
}

export interface LeadOfferInput {
  trade: string;
  where: string;
  createdAt: Date;
  reservedHours: number;
  nextShop: string;
  href: string;
  ref?: string;
}

/** Platform lockup — this is JobFlex marketplace mail, not the org's own. */
export function buildLeadOffer(i: LeadOfferInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "field", label: "Trade", value: i.trade },
    { type: "field", label: "Where", value: i.where },
    { type: "anchor", label: "Yours for", value: countdown(i.createdAt, i.reservedHours) },
    { type: "cond", label: "Then offered on", chip: i.nextShop, tone: "bad" },
  ];
  return {
    subject: `New lead for you — ${i.trade} in ${i.where}`,
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Lead offer" },
    headline: `${i.trade} lead in ${i.where}`,
    box,
    cta: { label: "Accept this lead", href: i.href },
    footer: { name: "JobFlex", ref: i.ref },
  };
}

export interface SupportTicketInput {
  subject: string;
  body: string;
  category: string;
  priority: string;
  orgName: string;
  submitterEmail: string | null;
  href: string;
}

/** Platform lockup — this reaches admins, never the submitting org. */
export function buildSupportTicket(i: SupportTicketInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "field", label: "Category", value: i.category },
    { type: "field", label: "From", value: i.submitterEmail ? `${i.orgName} (${i.submitterEmail})` : i.orgName },
    { type: "cond", label: "Respond within", chip: i.priority === "high" ? "1 hour" : "1 day" },
  ];
  const highPriority = i.priority === "high";
  return {
    subject: `${highPriority ? "High priority — " : ""}New support ticket — ${i.subject}`,
    lockup: PLATFORM_LOCKUP,
    kicker: highPriority ? { text: "High priority", tone: "bad" } : { text: "Support" },
    headline: truncate(i.subject, TITLE_MAX),
    box,
    after: [i.body],
    cta: { label: "Open admin inbox", href: i.href },
    footer: { name: "JobFlex" },
  };
}
