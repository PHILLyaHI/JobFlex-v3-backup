// THE LEAD SET-UP REMINDER (owner, 2026-10-07: "remind them every day to set
// up address and specialties for leads"). One mail a day while either is
// missing, for the shop's first two weeks (lib/leadSetupReminders).
import type { BoxRow, EmailDoc, Lockup } from "../doc";

const PLATFORM_LOCKUP: Lockup = { kind: "platform" };
const PLATFORM_FOOTER = { name: "JobFlex" };

export interface LeadSetupReminderInput {
  name: string | null;
  business: string;
  needsAddress: boolean;
  needsTrades: boolean;
  /** The company page, where the address and the trades are set. */
  href: string;
  /** The nth reminder, from 1. */
  nth: number;
}

export function buildLeadSetupReminder(i: LeadSetupReminderInput): EmailDoc {
  const first = i.name?.trim().split(/\s+/)[0] || "there";
  const what = i.needsAddress && i.needsTrades ? "your address and specialties" : i.needsAddress ? "your address" : "your specialties";
  const box: BoxRow[] = [
    { type: "cond", label: "Address", chip: i.needsAddress ? "Missing" : "Set", tone: i.needsAddress ? "warn" : "ok" },
    { type: "cond", label: "Specialties", chip: i.needsTrades ? "Missing" : "Set", tone: i.needsTrades ? "warn" : "ok" },
  ];
  return {
    subject: i.nth === 1 ? "Add your address and specialties to start receiving leads" : `Still no leads for ${i.business}: ${what} missing`,
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Free leads", tone: "warn" },
    headline: i.nth === 1 ? "Leads need two things from you" : "Your leads are waiting on one step",
    prose: [
      `Hi ${first} — homeowner jobs are matched to ${i.business} by distance and by trade. Right now ${what} ${i.needsAddress && i.needsTrades ? "are" : "is"} not set, so there is nothing to match yet.`,
      "It takes about two minutes on your company page: type the company address, pick the trades you want jobs for, save. Matching starts the same day.",
    ],
    box,
    cta: { label: "Complete your profile", href: i.href },
    after: ["This reminder stops as soon as both are set, or after two weeks. Reply to this email if anything is unclear."],
    footer: PLATFORM_FOOTER,
  };
}
