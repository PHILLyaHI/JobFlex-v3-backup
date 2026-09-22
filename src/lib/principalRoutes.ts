// WHO MAY STAND WHERE. Two principals share one session cookie: a USER (a
// contractor's account, with an organisation) and an INFLUENCER (a partner,
// with none). Each has its own surface, and a session of one kind opening the
// other's surface is never right: a partner on /dashboard got the contractor
// shell with no organisation behind it and every action threw NoOrgError; an
// owner on /influencer got the partner door. The middleware asks this first,
// before any role gate; the server guards (lib/orgContext) refuse the same
// thing a second time, since the middleware is fail-open.
//
// Pure, so scripts/qa can walk the table without a request.

export const PARTNER_HOME = "/influencer";
export const CONTRACTOR_HOME = "/dashboard";

/** The partner door, the invite/reset landing and the forgot form need no session. */
export const PARTNER_PUBLIC_PREFIXES = [
  "/influencer/login",
  "/influencer/set-password",
  "/influencer/forgot-password",
];

export function isPartnerArea(pathname: string): boolean {
  return pathname === PARTNER_HOME || pathname.startsWith(`${PARTNER_HOME}/`);
}

export function isPartnerPublic(pathname: string): boolean {
  return PARTNER_PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Where a signed-in principal is sent instead of `pathname`, or null when the
 * path is theirs. A partner anywhere outside /influencer goes home; a user on
 * a partner page (other than the public doors) goes to the dashboard.
 */
export function principalRedirect(pathname: string, principal: string | null | undefined): string | null {
  if (principal === "INFLUENCER") return isPartnerArea(pathname) ? null : PARTNER_HOME;
  if (principal === "USER" && isPartnerArea(pathname) && !isPartnerPublic(pathname)) return CONTRACTOR_HOME;
  return null;
}
