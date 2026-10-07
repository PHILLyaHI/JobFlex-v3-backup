// A FAILED SUBSCRIPTION PAYMENT (owner, 2026-10-07; lib/cardUpdate): the
// first failed charge, and Stripe's last try. Platform emails — JobFlex's own
// lockup — built the way build/trial.ts builds its reminders: pure, no I/O,
// one box, one button (to /dashboard/subscription, where the ribbon's
// "Update card" opens the card form). Receipts for successful payments are
// Stripe's own (Settings → Customer emails), not ours.
import type { BoxRow, EmailDoc, Lockup } from "../doc";

const PLATFORM_LOCKUP: Lockup = { kind: "platform" };
const PLATFORM_FOOTER = { name: "JobFlex" };
const DATE_FMT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export interface PaymentFailedInput {
  name: string | null;
  /** The plan, by its catalog name. */
  planName: string;
  /** What the failed invoice asks for. */
  amountCents: number;
  /** Stripe's next try; null on the last one. */
  nextAttemptAt: Date | null;
  /** Absolute link to /dashboard/subscription. */
  href: string;
  /** True when Stripe has stopped retrying: the plan is closed. */
  final: boolean;
}

function money(cents: number): string {
  const d = cents / 100;
  return Number.isInteger(d) ? `$${d}` : `$${d.toFixed(2)}`;
}

export function buildPaymentFailed(i: PaymentFailedInput): EmailDoc {
  const first = i.name?.trim().split(/\s+/)[0] || "there";
  const amount = money(i.amountCents);
  const box: BoxRow[] = [
    { type: "field", label: "Plan", value: i.planName },
    { type: "field", label: "Amount due", value: amount },
    i.final
      ? { type: "cond", label: "Status", chip: "Plan closed", tone: "bad" }
      : { type: "cond", label: "Next try", chip: i.nextAttemptAt ? DATE_FMT.format(i.nextAttemptAt) : "Soon", tone: "warn" },
  ];
  if (i.final) {
    return {
      subject: "Your JobFlex plan is closed — the payment didn't go through",
      lockup: PLATFORM_LOCKUP,
      kicker: { text: "Payment failed", tone: "bad" },
      headline: "Your plan is closed",
      prose: [
        `Hi ${first} — we tried your card several times for ${i.planName} (${amount}) and every try was declined, so the plan's tools are closed now.`,
        "Everything you made is still there — proposals, clients and jobs stay open. Update your card or choose a plan to open the rest again.",
      ],
      box,
      cta: { label: "Open Subscription", href: i.href },
      after: ["Questions? Reply to this email and we'll help."],
      footer: PLATFORM_FOOTER,
    };
  }
  return {
    subject: "Your JobFlex payment didn't go through",
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Payment failed", tone: "warn" },
    headline: "Update your card to keep your plan",
    prose: [
      `Hi ${first} — the ${amount} charge for ${i.planName} was declined.`,
      i.nextAttemptAt
        ? `Your workspace stays open, and we'll try the card again on ${DATE_FMT.format(i.nextAttemptAt)}. Update it now and the payment goes through right away.`
        : "Your workspace stays open for now. Update your card and the payment goes through right away.",
    ],
    box,
    cta: { label: "Update card", href: i.href },
    after: ["Questions? Reply to this email and we'll help."],
    footer: PLATFORM_FOOTER,
  };
}
