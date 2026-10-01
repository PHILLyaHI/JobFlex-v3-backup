// The card-less trial's two reminders (owner, 2026-10-01; lib/cardlessTrial):
// two days before the trial ends, and on the day. Platform emails — JobFlex's
// own lockup — built the way build/planGrant.ts builds its one: pure, no I/O,
// one box, one button (to /dashboard/trial, where the card is added).
import type { BoxRow, EmailDoc, Lockup } from "../doc";

const PLATFORM_LOCKUP: Lockup = { kind: "platform" };
const PLATFORM_FOOTER = { name: "JobFlex" };
const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export interface TrialReminderInput {
  name: string | null;
  /** The plan the trial runs on, by its catalog name. */
  planName: string;
  /** "$79/mo" */
  price: string;
  endsAt: Date;
  /** Absolute link to /dashboard/trial. */
  href: string;
  /** "soon" — two days out; "today" — the last day. */
  when: "soon" | "today";
}

export function buildTrialReminder(i: TrialReminderInput): EmailDoc {
  const first = i.name?.trim().split(/\s+/)[0] || "there";
  const date = DATE_FMT.format(i.endsAt);
  const today = i.when === "today";
  const box: BoxRow[] = [
    { type: "field", label: "Plan", value: `${i.planName} · ${i.price}` },
    { type: "field", label: "Trial ends", value: today ? `Today, ${date}` : date },
    { type: "cond", label: "Card on file", chip: "None yet", tone: "warn" },
  ];
  return {
    subject: today ? "Your JobFlex trial ends today" : "2 days left in your JobFlex trial",
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Free trial", tone: "warn" },
    headline: today ? "Your free trial ends today" : "Two days left in your free trial",
    prose: [
      today
        ? `Hi ${first} — your 7-day trial of ${i.planName} ends today, and there is no card on file yet.`
        : `Hi ${first} — your 7-day trial of ${i.planName} ends on ${date}, and there is no card on file yet.`,
      `Add a card to keep your workspace open: ${i.planName} carries on at ${i.price}, charged when the trial ends. Without one the workspace turns read-only — everything you made stays, and a card brings it back.`,
    ],
    box,
    cta: { label: "Add a card", href: i.href },
    after: ["Nothing is charged until you add a card. Questions? Reply to this email and we'll help."],
    footer: PLATFORM_FOOTER,
  };
}
