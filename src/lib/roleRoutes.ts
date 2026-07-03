// Route allow-lists for the limited membership roles. Shared by the middleware
// (JWT-based UX gate, fail-open) and the (dashboard) layout (DB-role gate,
// fail-closed) so the two boundaries can never drift apart. Keep this module
// dependency-free — the middleware runs on the edge runtime.
//
// A path is allowed when it equals a prefix or lives under it ("/x" or "/x/…").
// Anything else redirects to the role's home surface.

export interface RoleRouteGate {
  allowed: string[];
  home: string;
}

export const ROLE_ROUTE_GATES: Record<string, RoleRouteGate> = {
  // Field workers: read-only jobs + own schedule + messages.
  INSTALLER: {
    allowed: ["/dashboard/jobs", "/dashboard/calendar", "/dashboard/messages"],
    home: "/dashboard/jobs",
  },
  // Sales reps: the pipeline slice.
  SALES: {
    allowed: [
      "/dashboard/leads",
      "/dashboard/clients",
      "/dashboard/proposals",
      "/dashboard/crm",
      "/dashboard/calendar",
      "/dashboard/phone",
      "/dashboard/messages",
    ],
    home: "/dashboard/leads",
  },
  // Estimators: proposals + the AI estimators.
  ESTIMATOR: {
    allowed: [
      "/dashboard/proposals",
      "/dashboard/clients",
      "/dashboard/advanced-ai",
      "/dashboard/messages",
    ],
    home: "/dashboard/proposals",
  },
};

/** True when `pathname` sits inside one of the gate's allowed prefixes. */
export function isPathAllowed(gate: RoleRouteGate, pathname: string): boolean {
  return gate.allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
