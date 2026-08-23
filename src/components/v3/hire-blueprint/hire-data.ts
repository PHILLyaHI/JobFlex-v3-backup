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
  { icon: 'i-search', kicker: 'For hirers', title: 'Discover talent',
    body: 'See which companies in the trade network are open for work — their trades, specialties and service area.',
    cta: 'Open the directory', goto: 'talent' },
  { icon: 'i-userplus', kicker: 'For workers', title: 'Publish your profile',
    body: 'List your trades and service area as open for work, so matching trade jobs land in your inbox.',
    cta: 'Manage your profile', goto: 'profile' },
];

export const HUB_LINKS: HubLink[] = [
  { icon: 'i-users', label: 'Applicant pipeline', sub: 'Track candidates through your hiring funnel', goto: 'pipeline' },
  { icon: 'i-jobs',  label: 'Job posts',          sub: 'The work you broadcast to the trade network', href: '/trade-services' },
  { icon: 'i-send',  label: 'Applications',       sub: 'Interest on your posts, and jobs you raised a hand for', href: '/trade-services' },
];
