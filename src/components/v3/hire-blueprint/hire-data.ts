// Hire blueprint — static shape of the hub + pipeline, typed from the donor
// (jobflex-hire-blueprint_4.html). Every value that used to be a fixture is
// now real:
//
// - The applicant pipeline is read in src/app/dashboard/hire/page.tsx (via
//   getHireSeed in src/actions/applicants.ts) and every change goes back
//   through the applicant server actions. There is NO fixture fallback — a
//   render with nothing to query shows the board's own empty state.
// - The hub tallies are computed from the org's trade-network records
//   (TradeJob / TradeJobRecipient) plus the pipeline's HIRED count — see
//   HireTallies below and buildTally in hire-behavior.ts.
// - Both marketplace doors open real panels: the talent directory
//   (discoverTradeProfiles) and the open-for-work profile
//   (get/setTradeNetworkOptIn), both in src/actions/tradeServices.ts.

export type HireColumnKey = "APPLIED" | "INTERVIEWING" | "HIRED" | "REJECTED";

export type HireColumn = {
  key: HireColumnKey;
  label: string;
  tone: string;
};

export type Applicant = {
  /** The real `Applicant.id` (cuid). */
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: HireColumnKey;
  source: string | null;
  /** Relative "applied" plate — `relative(createdAt)` from @/lib/format. */
  age: string;
  notes: string;
  resumeUrl?: string | null;
};

export type HubDoor = {
  icon: string;
  kicker: string;
  title: string;
  body: string;
  cta: string;
  /** The in-route panel the door opens (data-panel name). */
  goto: string;
};

export type HubLink = {
  icon: string;
  label: string;
  sub: string;
  /** Swap to another panel on this route… */
  goto?: string;
  /** …or navigate to another route entirely. */
  href?: string;
};

/** The three "Your activity" numbers, computed server-side in page.tsx:
 *  - hired: pipeline records in HIRED
 *  - openPosts / totalPosts: the caller's TradeJobs (getMyTradeJobs)
 *  - interestReceived: INTERESTED responses on the caller's TradeJobs
 *  - interestSent: trade jobs the caller raised a hand for (getTradeInbox) */
export type HireTallies = {
  hired: number;
  openPosts: number;
  totalPosts: number;
  interestReceived: number;
  interestSent: number;
};

// Applicant: fullName, email, phone, role, status, source, notes, createdAt.
export const HK_COLUMNS: HireColumn[] = [
  { key: "APPLIED", label: "Applied", tone: "var(--blueprint)" },
  { key: "INTERVIEWING", label: "Interviewing", tone: "var(--warning)" },
  { key: "HIRED", label: "Hired", tone: "var(--success)" },
  { key: "REJECTED", label: "Rejected", tone: "var(--danger)" },
];

export const SOURCES: string[] = ["Indeed", "Referral", "Walk-in", "LinkedIn", "Job fair", "Other"];

export const HUB_DOORS: HubDoor[] = [
  { icon: 'i-search', kicker: '', title: 'Find a contractor',
    body: 'Companies near you that are open for work.',
    cta: 'Open the directory', goto: 'talent' },
  // Was "Publish your profile" — the panel behind it became the Post-a-job
  // composer (owner, 2026-08-23). Listing management moved to a hub row below
  // (/trade-services carries the same opt-in form the panel used to).
  { icon: 'i-send', kicker: '', title: 'Post a job',
    body: 'Send work you can\'t take to contractors who can.',
    cta: 'Post a job', goto: 'profile' },
];

export const HUB_LINKS: HubLink[] = [
  // Applicant pipeline / Job posts / Applications were dropped (owner,
  // 2026-08-24); "Manage your profile" followed on 2026-09-02 — the "Go
  // deeper" card is gone and Your listing is a head action instead.
];
