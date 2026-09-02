// Pure (record) → EmailDoc builders for the five platform-facing emails. No
// I/O, so the gallery can render them from fixtures and the senders stay
// thin. Four of five use the PLATFORM lockup and a "JobFlex" footer — this
// is mail from JobFlex itself, never a faked org identity (principle 20).
// buildTestEmail is the one exception: it exists to prove an org's OWN
// lockup renders, so it deliberately uses the contractor lockup.
import type { BoxRow, EmailDoc, Lockup } from "../doc";
import type { OrgBrand } from "./client";

const PLATFORM_LOCKUP: Lockup = { kind: "platform" };
const PLATFORM_FOOTER = { name: "JobFlex" };

function orgLockup(org: OrgBrand): Lockup {
  return { kind: "org", name: org.name, logoUrl: org.logoUrl ?? null };
}

function orgFooter(org: OrgBrand) {
  return { name: org.name, contact: org.phone ?? undefined };
}

export interface PasswordResetInput {
  name: string | null;
  href: string;
}

/**
 * One-row box, tone warn — the deadline is the only thing worth boxing. Worded
 * "Link expires / In 1 hour" to match the other link-expiry rows in the fleet
 * (partner invite, worker invite) rather than drifting to its own phrasing.
 */
export function buildPasswordReset(i: PasswordResetInput): EmailDoc {
  const box: BoxRow[] = [{ type: "cond", label: "Link expires", chip: "In 1 hour", tone: "warn" }];
  return {
    subject: "Reset your JobFlex password",
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Security" },
    headline: "Reset your password",
    prose: [
      `Hi ${i.name?.split(" ")[0] ?? "there"} — we received a request to reset the password for your JobFlex account.`,
    ],
    box,
    cta: { label: "Set a new password", href: i.href },
    fine: "Didn't ask for this? Ignore the email — your password won't change.",
    footer: PLATFORM_FOOTER,
  };
}

export interface RequestReceivedInput {
  name: string;
  projectType: string | null;
  /** The homeowner's status page (/request/[token]); null for legacy rows with no token. */
  statusUrl?: string | null;
}

/** Solo anchor; the CTA is the homeowner's one link into the system. */
export function buildRequestReceived(i: RequestReceivedInput): EmailDoc {
  return {
    subject: "We got your request — matching you with a pro",
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Received" },
    headline: "We're on it",
    prose: [
      `Hi ${i.name.split(" ")[0]} — thanks for telling us about your project${
        i.projectType ? ` (${i.projectType})` : ""
      }. We're matching you with a qualified local contractor now.`,
    ],
    box: [{ type: "anchor", label: "You'll hear back", value: "Within 24h" }],
    ...(i.statusUrl ? { cta: { label: "Track your request", href: i.statusUrl } } : {}),
    footer: PLATFORM_FOOTER,
  };
}

export interface HomeownerMatchedInput {
  name: string;
  orgName: string;
  phone: string | null;
  /** Pre-formatted by the caller, e.g. "4.8" or "New" for a shop with no reviews yet. */
  rating: string;
  projectType: string | null;
  /** The homeowner's status page (/request/[token]); null for legacy rows with no token. */
  statusUrl?: string | null;
}

/** Box: Phone, Rating, then a call-by condition. CTA opens the status page. */
export function buildHomeownerMatched(i: HomeownerMatchedInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "field", label: "Phone", value: i.phone ?? "—" },
    { type: "field", label: "Rating", value: i.rating },
    { type: "cond", label: "They'll call by", chip: "Within 2 hours" },
  ];
  return {
    subject: `You're matched — ${i.orgName} will be in touch`,
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Matched", tone: "ok" },
    headline: "You're matched",
    prose: [
      `Hi ${i.name.split(" ")[0]} — good news: ${i.orgName} has taken on your ${
        i.projectType ?? "project"
      } request and will reach out shortly.`,
    ],
    box,
    ...(i.statusUrl ? { cta: { label: "View your request", href: i.statusUrl } } : {}),
    fine: i.statusUrl
      ? "If it doesn't work out with this contractor, the request page lets you ask for another one."
      : undefined,
    footer: PLATFORM_FOOTER,
  };
}

// ── "Find me another contractor" (the homeowner's re-route button) ───────────

export interface ShopClientRerouteInput {
  orgName: string;
  homeownerName: string;
  projectType: string | null;
  /** The homeowner's optional reason — shown verbatim when present (owner's rule #4). */
  reason: string | null;
}

/**
 * Honest and unsoftened, to the shop that had the lead: the client asked for
 * another contractor. Does not touch their responsiveness score and says so —
 * the one question every recipient of this email asks.
 */
export function buildShopClientReroute(i: ShopClientRerouteInput): EmailDoc {
  const box: BoxRow[] = [
    { type: "field", label: "Project", value: i.projectType ?? "General" },
    ...(i.reason ? [{ type: "field", label: "Their reason", value: i.reason } as BoxRow] : []),
  ];
  return {
    subject: `${i.homeownerName} asked to be matched with another contractor`,
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Lead update", tone: "warn" },
    headline: "The client asked for another contractor",
    prose: [
      `${i.homeownerName} has asked us to match their ${
        i.projectType ?? "project"
      } request with a different contractor, so it has been withdrawn from your board. The lead is marked lost in your pipeline for your records.`,
      "This does not affect your standing or your ranking for future leads.",
    ],
    box,
    footer: PLATFORM_FOOTER,
  };
}

export interface HomeownerReroutingInput {
  name: string;
  projectType: string | null;
  statusUrl: string | null;
}

/** Confirmation to the homeowner right after they pressed the button. */
export function buildHomeownerRerouting(i: HomeownerReroutingInput): EmailDoc {
  return {
    subject: "Got it — finding you another contractor",
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Re-matching" },
    headline: "We're finding you another pro",
    prose: [
      `Hi ${i.name.split(" ")[0]} — understood. We've released your ${
        i.projectType ?? "project"
      } request from the previous contractor and are matching you with the next qualified pro in your area.`,
    ],
    box: [{ type: "anchor", label: "You'll hear back", value: "Within 24h" }],
    ...(i.statusUrl ? { cta: { label: "Track your request", href: i.statusUrl } } : {}),
    footer: PLATFORM_FOOTER,
  };
}

export interface HomeownerManualQueueInput {
  name: string;
  projectType: string | null;
  statusUrl: string | null;
}

/**
 * The pool ran dry (owner's rule #3): a person takes over, and no timeframe is
 * promised — "we'll be in touch" is the whole commitment.
 */
export function buildHomeownerManualQueue(i: HomeownerManualQueueInput): EmailDoc {
  return {
    subject: "We're matching you by hand",
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "In progress" },
    headline: "A person is on it",
    prose: [
      `Hi ${i.name.split(" ")[0]} — matching your ${
        i.projectType ?? "project"
      } request automatically didn't land it with the right contractor, so our team is now placing it by hand. We'll be in touch as soon as it's placed.`,
    ],
    ...(i.statusUrl ? { cta: { label: "Track your request", href: i.statusUrl } } : {}),
    footer: PLATFORM_FOOTER,
  };
}

export interface PartnerInviteInput {
  name: string;
  code?: string | null;
  href: string;
}

/** Same shape as buildWorkerInvite — a promo code becomes an extra field row when present. */
export function buildPartnerInvite(i: PartnerInviteInput): EmailDoc {
  const box: BoxRow[] = [];
  if (i.code) box.push({ type: "field", label: "Promo code", value: i.code });
  box.push({ type: "cond", label: "Link expires", chip: "In 7 days" });
  const first = i.name.trim().split(" ")[0] || "there";
  return {
    subject: "Your JobFlex partner account",
    lockup: PLATFORM_LOCKUP,
    kicker: { text: "Partner" },
    headline: "You're set up as a partner",
    prose: [
      `Hi ${first} — you've been set up as a JobFlex partner. Share your link, watch your referrals convert, and request payouts from your partner dashboard.`,
    ],
    box,
    cta: { label: "Set your password", href: i.href },
    footer: PLATFORM_FOOTER,
  };
}

export interface TestEmailInput {
  org: OrgBrand;
}

/**
 * Smallest build in the system: lockup, one prose line, footer. No box, no
 * CTA. Uses the CONTRACTOR lockup, not platform — it proves the org's own
 * lockup renders.
 */
export function buildTestEmail(i: TestEmailInput): EmailDoc {
  return {
    subject: "JobFlex test email",
    lockup: orgLockup(i.org),
    headline: "This is a test",
    prose: ["If you're reading this, sending works."],
    footer: orgFooter(i.org),
  };
}
