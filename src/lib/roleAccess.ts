// What each invitable role SEES and DOES, in the contractor's words — the copy
// under the role picker on the Workers invite sheet (desktop and handheld).
//
// Written from the enforced rules, not from intent: the route allow-lists in
// lib/roleRoutes (which pages a limited role may open), the guards in
// lib/orgContext (requireManager / requireSalesOrManager /
// requireEstimatorOrManager / requireProposalStaff's own-proposals scope /
// requireJobEventCreator), the nav plan in blueprint-shell/nav-map (owner-only
// Subscription), and the seat metering in lib/limitsEngine. When one of those
// changes, this list changes with it — a role card that promises a page the
// gate then bounces is worse than no card.
//
// Dependency-free on purpose: the handheld page imports it into a client
// bundle, and the blueprint sheet builds its markup from it imperatively.

export interface RoleAccess {
  /** The role as the roster names it. */
  title: string;
  /** One line under the title — what this person is for. */
  who: string;
  /** What they see and can do, each a short line. Check-marked. */
  gets: string[];
  /** What they never see — one sentence. */
  not: string;
  /** The invite note: how they get in and what seat it takes. */
  invite: string;
}

const ACCESS: Record<string, RoleAccess> = {
  INSTALLER: {
    title: "Installer",
    who: "Field crew",
    gets: [
      "Only the jobs assigned to them — address, scope, notes, photos",
      "Their own schedule, and they can add time on a job they're on",
      "Messages with the office",
    ],
    not: "no clients, proposals, prices, leads, money or settings.",
    invite:
      "We email them an invite link. They accept, set a password, and land on their own job list. Uses a worker seat on your plan.",
  },
  SALES: {
    title: "Sales rep",
    who: "Runs the pipeline",
    gets: [
      "Leads and the CRM follow-up queue",
      "Clients and every client record",
      "Proposals they create (never another rep's), with the manual builder",
      "Calendar, phone and messages",
    ],
    not: "no AI estimators, no jobs or crew, no financials, no settings.",
    invite:
      "We email them an invite link. They accept, set a password, and sign in to a sales view of the dashboard. Uses a worker seat on your plan.",
  },
  ESTIMATOR: {
    title: "Estimator",
    who: "Prices the work",
    gets: [
      "Roof estimator, fence estimator and Smart Proposal (AI)",
      "Proposals they create (never another estimator's), with the manual builder",
      "Projects",
      "Messages with the office",
    ],
    not: "no clients or leads pages, no calendar or phone, no jobs, no money or settings.",
    invite:
      "We email them an invite link. They accept, set a password, and sign in to an estimating view of the dashboard. Uses a worker seat on your plan.",
  },
  MANAGER: {
    title: "Manager",
    who: "Runs the office",
    gets: [
      "The whole dashboard: every proposal, client, lead, project, job and the calendar",
      "Crew: invites, removes and re-roles workers; assigns jobs",
      "Financials, reports, automation and company settings",
    ],
    not: "subscription and billing stay with the owner.",
    invite:
      "We email them an invite link. They accept, set a password, and sign in with full office access. Uses a manager seat on your plan.",
  },
};

/** The facts for a role; an unknown role reads as the installer's slice, the
 *  narrowest — never a promise of more than the gate allows. */
export function roleAccess(role: string | null | undefined): RoleAccess {
  return ACCESS[role ?? ""] ?? ACCESS.INSTALLER;
}
