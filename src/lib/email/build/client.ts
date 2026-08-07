// Pure (record) → EmailDoc builders for the six client-facing emails. No I/O,
// so the gallery can render them from fixtures and the senders stay thin.
// Voice: letter — greeting and sign-off (principle 19, client altitude).
import type { BoxRow, EmailDoc, Lockup } from "../doc";
import { capItems, truncate } from "../fit";

const ITEM_CAP = 12;
const ITEM_NAME_MAX = 140;
const TITLE_MAX = 70;

export interface OrgBrand {
  name: string;
  logoUrl?: string | null;
  phone?: string | null;
}

function orgLockup(org: OrgBrand): Lockup {
  return { kind: "org", name: org.name, logoUrl: org.logoUrl ?? null };
}

function orgFooter(org: OrgBrand, ref?: string) {
  return { name: org.name, contact: org.phone ?? undefined, ref };
}

export function formatUSD(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function shortDate(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(d);
}

export interface ProposalSentInput {
  org: OrgBrand;
  clientName: string;
  title: string;
  lineItems: { name: string; total: number }[];
  taxRate: number;
  taxTotal: number;
  total: number;
  validUntil: Date | null;
  href: string;
  ref?: string;
  /** Contractor-authored template prose. Falls back to house copy. */
  prose?: string[];
}

export function buildProposalSent(i: ProposalSentInput): EmailDoc {
  const { shown, remainder, remainderTotal } = capItems(i.lineItems, ITEM_CAP, (li) => li.total);

  const box: BoxRow[] = shown.map((li) => ({
    type: "item" as const,
    name: truncate(li.name, ITEM_NAME_MAX),
    amount: formatUSD(li.total),
  }));

  if (remainder > 0) {
    box.push({ type: "item", name: `${remainder} more items`, amount: formatUSD(remainderTotal) });
  }
  // Principle 03 — the tax row renders only when there is tax.
  if (i.taxTotal > 0) {
    box.push({
      type: "rate",
      label: "Tax",
      rate: `${Number(i.taxRate.toFixed(2))}%`,
      amount: formatUSD(i.taxTotal),
    });
  }
  box.push({ type: "anchor", label: "Total", value: formatUSD(i.total) });
  if (i.validUntil) {
    box.push({ type: "cond", label: "Price held until", chip: shortDate(i.validUntil) });
  }

  return {
    subject: `Your proposal from ${i.org.name}`,
    lockup: orgLockup(i.org),
    kicker: { text: "Proposal" },
    headline: truncate(i.title, TITLE_MAX),
    prose: i.prose ?? [
      `Hi ${i.clientName.split(" ")[0]} — here's the work we walked through, priced out.`,
    ],
    box,
    cta: { label: "Review & accept", href: i.href },
    after: ["Anything you'd like changed? Just reply — it comes straight to us."],
    footer: orgFooter(i.org, i.ref),
  };
}

export interface ProposalAcceptedInput {
  org: OrgBrand;
  clientName: string;
  title: string;
  total: number;
  callByDate: Date | null;
  prose?: string[];
}

/** No CTA — there is nothing for the client to do (principle 06·a). */
export function buildProposalAccepted(i: ProposalAcceptedInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "field", label: "Job", value: truncate(i.title, TITLE_MAX) },
    { type: "anchor", label: "Agreed", value: formatUSD(i.total) },
  ];
  if (i.callByDate) {
    box.push({ type: "cond", label: "We'll call by", chip: shortDate(i.callByDate) });
  }
  return {
    subject: `Thanks for accepting — ${i.org.name}`,
    lockup: orgLockup(i.org),
    kicker: { text: "Confirmed", tone: "ok" },
    headline: "You're booked in",
    prose: i.prose ?? [
      `Thanks ${i.clientName.split(" ")[0]} — we've got your acceptance and we're getting the work scheduled.`,
    ],
    box,
    after: ["Nothing needed from you until then."],
    footer: orgFooter(i.org),
  };
}

export interface FollowUpInput {
  org: OrgBrand;
  title: string;
  total: number;
  validUntil: Date | null;
  href: string;
  prose?: string[];
}

/** Items are dropped — the client has already seen them. Anchor + condition only. */
export function buildFollowUp(i: FollowUpInput): EmailDoc {
  const box: BoxRow[] = [{ type: "anchor", label: "Total", value: formatUSD(i.total) }];
  if (i.validUntil) {
    const days = Math.max(0, Math.ceil((i.validUntil.getTime() - Date.now()) / 86_400_000));
    box.push({
      type: "cond",
      label: "Expires in",
      chip: days === 1 ? "1 day" : `${days} days`,
      tone: days <= 3 ? "warn" : "neutral",
    });
  }
  return {
    subject: `Still holding your price — ${truncate(i.title, 40)}`,
    lockup: orgLockup(i.org),
    kicker: { text: "Reminder" },
    headline: "Still holding your price",
    prose: i.prose ?? ["No rush, but the quote runs out soon and I didn't want it to lapse quietly."],
    box,
    cta: { label: "Review & accept", href: i.href },
    footer: orgFooter(i.org),
  };
}

export interface ChangeOrderInput {
  org: OrgBrand;
  clientName: string;
  contextTitle: string;
  coTitle: string;
  description?: string | null;
  amount: number;
  previousTotal: number;
  href: string;
}

export function buildChangeOrder(i: ChangeOrderInput): EmailDoc {
  const signed = `${i.amount >= 0 ? "+" : "−"}${formatUSD(Math.abs(i.amount))}`;
  return {
    subject: `Change order for ${i.contextTitle}`,
    lockup: orgLockup(i.org),
    kicker: { text: "Change order" },
    headline: "One change needs your ok",
    prose: [
      `Hi ${i.clientName.split(" ")[0]} — ${i.description?.trim() || `we have a change to the contract on "${i.contextTitle}".`}`,
    ],
    box: [
      { type: "item", name: "Agreed contract", amount: formatUSD(i.previousTotal) },
      { type: "item", name: truncate(i.coTitle, ITEM_NAME_MAX), amount: signed },
      { type: "anchor", label: "New total", value: formatUSD(i.previousTotal + i.amount) },
      { type: "cond", label: "Work paused until", chip: "Approved", tone: "bad" },
    ],
    cta: { label: "Review & approve", href: i.href },
    footer: orgFooter(i.org),
  };
}

export interface PaymentReminderInput {
  org: OrgBrand;
  clientName: string;
  title: string;
  agreedTotal: number;
  paidToDate: number;
  dueNow: number;
  dueLabel: string;
  dueDate: Date | null;
  href: string;
}

export function buildPaymentReminder(i: PaymentReminderInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "item", name: "Agreed total", amount: formatUSD(i.agreedTotal) },
    // Zero here is the POINT — it explains the balance. Principle 03 bans
    // empty rows, not zero values.
    { type: "item", name: "Paid to date", amount: formatUSD(i.paidToDate) },
    { type: "anchor", label: "Due now", value: formatUSD(i.dueNow) },
  ];
  if (i.dueDate) {
    box.push({ type: "cond", label: "Due", chip: shortDate(i.dueDate), tone: "warn" });
  }
  return {
    subject: `Payment reminder — ${i.dueLabel} for ${truncate(i.title, 40)}`,
    lockup: orgLockup(i.org),
    kicker: { text: "Payment" },
    headline: `${i.dueLabel} is due`,
    prose: [`Hi ${i.clientName.split(" ")[0]} — the ${i.dueLabel.toLowerCase()} on ${i.title} is due.`],
    box,
    cta: { label: `Pay ${i.dueLabel.toLowerCase()}`, href: i.href },
    footer: orgFooter(i.org),
  };
}

export interface ReviewRequestInput {
  org: OrgBrand;
  clientName: string;
  jobTitle: string;
  href: string;
}

/** No box — nothing worth anchoring (principle 12·a). */
export function buildReviewRequest(i: ReviewRequestInput): EmailDoc {
  return {
    subject: `How did we do? — ${i.org.name}`,
    lockup: orgLockup(i.org),
    kicker: { text: "One favour" },
    headline: "How did we do?",
    prose: [
      `Hi ${i.clientName.split(" ")[0]} — hope everything's holding up nicely after the ${i.jobTitle.toLowerCase()}.`,
      "If you've got thirty seconds, a short review genuinely helps a small shop like ours.",
    ],
    cta: { label: "Leave a review", href: i.href },
    after: ["And if anything isn't right, reply here first — we'd rather fix it than read about it."],
    footer: orgFooter(i.org),
  };
}
