// The one email the complimentary plan sends: seven days before it ends. A
// platform email (JobFlex's own lockup), built the way build/platform.ts
// builds the others — pure, no I/O, one box, one button.
import type { BoxRow, EmailDoc, Lockup } from "../doc";

const PLATFORM_LOCKUP: Lockup = { kind: "platform" };
const PLATFORM_FOOTER = { name: "JobFlex" };
const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export interface ComplimentaryEndingInput {
  name: string | null;
  planName: string;
  endsAt: Date;
  /** "the Free plan" / "no plan (subscribe to continue)" — lib/planGrant.fallbackLabel. */
  fallback: string;
  /** The subscription page, where a plan can be chosen. */
  href: string;
}

export function buildComplimentaryEnding(i: ComplimentaryEndingInput): EmailDoc {
  const first = i.name?.trim().split(/\s+/)[0] || "there";
  const when = DATE_FMT.format(i.endsAt);
  const box: BoxRow[] = [
    { type: "field", label: "Plan", value: `${i.planName} · complimentary` },
    { type: "field", label: "Ends", value: when },
    { type: "cond", label: "After that", chip: i.fallback, tone: "warn" },
  ];
  return {
    subject: `Your complimentary ${i.planName} plan ends ${when}`,
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Subscription", tone: "warn" },
    headline: `Your complimentary ${i.planName} plan ends in 7 days`,
    prose: [
      `Hi ${first} — the ${i.planName} plan your shop has been using free of charge ends on ${when}.`,
      `Nothing is charged automatically. To keep ${i.planName} after that date, choose a plan from Subscription before it ends; otherwise your shop moves to ${i.fallback}.`,
    ],
    box,
    cta: { label: "Choose a plan", href: i.href },
    after: ["Questions about the plan? Reply to this email and we'll help."],
    footer: PLATFORM_FOOTER,
  };
}
