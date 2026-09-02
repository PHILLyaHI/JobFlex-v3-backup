// Blueprint layout — wraps the promoted blueprint pages (/dashboard and
// /dashboard/proposals) in the shared donor shell, so the sidebar and topbar
// mount once and persist across navigation between them.
//
// Scope: this layout only covers routes under src/app/dashboard/. The
// classic-shell children (/dashboard/proposals/new, /create, /[id], /ai,
// /templates and the rest) live under the (dashboard) route group, a separate
// branch of the tree, and keep their own layout untouched.
//
// The shell is wrapped in ResponsiveDashboardShell rather than mounted
// directly (owner's call, 2026-07-29): at ≤768px the two routes that have a
// handheld build serve it from this same URL, so the mobile design is reachable
// by resizing /dashboard into iPhone view instead of navigating to /mobile-v2.
// The switch lives at the LAYOUT, not in the pages, because the handheld build
// brings its own complete chrome — it replaces the shell, it does not render
// inside it.

// The sidebar's account block used to print the donor's demo identity — the
// literal strings "Ivan" / "Owner" — to every signed-in user. The real identity
// is read HERE, in the server layout, because the blueprint tree has no
// SessionProvider: `useSession()` inside the shell would return null. The read
// is deliberately non-fatal — an unauthenticated visitor is redirected by the
// PAGE, and a layout that threw would break that redirect before it ran.

// ROLE GATE (added 2026-08-17). This layout also carries the fail-CLOSED
// limited-role route gate that its sibling (dashboard)/layout.tsx has had since
// the RBAC rollout. The blueprint tree is a separate branch of app/, so it never
// inherited that layout — and the blueprint pages themselves only call
// requireOrg (authenticated + in an org), never a role guard. That left the
// middleware as the ONLY thing keeping an installer off /dashboard/financials,
// and the middleware is fail-OPEN by design: it decodes the JWT and, on any
// error, lets the request through. Same list, same helpers, same redirect as
// the classic tree — role from the DB, path from the middleware-set header.

import { redirect } from "next/navigation";
import type { Route } from "next";
import { headers } from "next/headers";
import { requireOrg } from "@/lib/orgContext";
import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";
import { getBlockedCustomPages } from "@/lib/customPageAccess";
import { UpgradeGate } from "@/components/v3/upgrade-gate/upgrade-gate";
import { isCustomBlockedPath } from "@/lib/customPlan";
import { getBadgeCounts } from "@/lib/badgeCounts";
import { db } from "@/lib/db";
import { ResponsiveDashboardShell } from "@/components/v3/responsive-shell/responsive-dashboard-shell";
import { LeadOfferPopup } from "@/components/leads/LeadOfferPopup";
import { DashboardAnnouncementDismiss } from "@/app/(dashboard)/announcement-dismiss";

/** Membership.role is a raw enum-ish string ("OWNER", "INSTALLER"). The
 *  sidebar shows it to a human, so title-case it. */
function humanRole(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default async function DashboardBlueprintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: { name: string; role: string } | undefined;
  // The RAW role, kept beside the humanised one: the nav filter matches on the
  // enum value ("INSTALLER"), the account block prints the pretty one.
  let role: string | null = null;
  let name: string | null = null;
  // Unread / pending-action counts by nav href, for the sidebar and the
  // handheld drawer. Read HERE for the same reason the identity is: the badge
  // module is server-only (raw tenant ids, never client-invokable) and the
  // shell below is a client tree. Stale-until-refresh is by design — the
  // MarkNavSeen stamp on each surface calls router.refresh() when a badge was
  // actually showing, which re-renders this layout with fresh counts.
  let badges: Record<string, number> | undefined;
  // The custom plan's page locks: hrefs this org did not buy, or null on every
  // other plan. Read beside the identity because both come from the same ctx.
  let lockedPages: string[] | null = null;
  // Platform announcements — published from /admin/announcements, shown as a
  // banner on every organization's dashboard. Read HERE because the shell is a
  // client tree; a failed read costs the banner, never the page.
  let announcements: Array<{
    id: string;
    title: string;
    body: string;
    priority: number;
    createdAt: Date;
    expiresAt: Date | null;
  }> = [];
  try {
    const ctx = await requireOrg();
    role = ctx.role;
    name = ctx.user.name || ctx.user.email || "Account";
    user = { name, role: humanRole(ctx.role) };
    // SEPARATE awaits, each with its own failure story. Bundled in one
    // Promise.all, a transient badge-count failure (SQLite "database is
    // locked" under the dashboard's burst of parallel reads) rejected the
    // whole bundle, the outer catch swallowed it, and lockedPages stayed null
    // — the plan gate silently FAILING OPEN because unread counts hiccuped.
    // Badges may fail quietly (a missing badge is cosmetic); the gate read
    // retries once and is never allowed to take the badges down with it.
    badges = await getBadgeCounts(ctx.organizationId, ctx.user.id, ctx.role).catch(
      () => undefined,
    );
    lockedPages = await getBlockedCustomPages(ctx.organizationId).catch(() =>
      getBlockedCustomPages(ctx.organizationId),
    );
    announcements = await db.announcement
      .findMany({
        where: {
          scope: "PLATFORM",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 6,
        select: { id: true, title: true, body: true, priority: true, createdAt: true, expiresAt: true },
      })
      .catch(() => []);
  } catch {
    // Signed out, or no membership yet. The page decides what happens next.
  }

  // Fail-closed: an unreadable path is not a pass. Only a role WITH a gate is
  // restricted, so office roles are untouched, and a signed-out visitor (role
  // null) still falls through to the page's own redirect-to-login.
  const gate = role ? ROLE_ROUTE_GATES[role] : undefined;
  if (gate) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname && !isPathAllowed(gate, pathname)) redirect(gate.home as Route);
  }

  // THE CUSTOM PLAN'S PAGE GATE — same inputs as the role gate above (plan
  // from the DB, path from the middleware-set header, fail-closed), but it
  // RENDERS the upgrade offer at the blocked URL instead of redirecting
  // (owner's call, 2026-08-31): the nav draws locked pages as dimmed padlocked
  // rows that still navigate, and this is what they open onto. The children —
  // the page's own server component — are never rendered for a blocked path,
  // so the gate is the boundary, not a curtain.
  let customGate: React.ReactNode = null;
  if (lockedPages?.length) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname && isCustomBlockedPath(lockedPages, pathname)) {
      customGate = <UpgradeGate pathname={pathname} />;
    }
  }

  // The lead pop-up was mounted only in the CLASSIC layout, so on the blueprint
  // tree — which is where the app actually lives now — a lead routed to a shop
  // announced itself nowhere.
  //
  // OWNER ONLY. A lead carries a homeowner's name, phone and job description,
  // and it is the owner who answers for the shop: the arrival announces itself
  // to them and to nobody else. Everyone who can work a lead still SEES it —
  // managers and sales open the Leads page and act there — but the interruption
  // belongs to one person (owner's call, 2026-08-27; same rule as the email,
  // see lib/notify's ownerEmailFor).
  const canHandleLeads = role === "OWNER";

  return (
    <ResponsiveDashboardShell
      user={user}
      identity={{ role, name }}
      badges={badges}
      locked={lockedPages ?? undefined}
    >
      {announcements.length > 0 && <DashboardAnnouncementDismiss announcements={announcements} />}
      {customGate ?? children}
      {canHandleLeads ? <LeadOfferPopup /> : null}
    </ResponsiveDashboardShell>
  );
}
