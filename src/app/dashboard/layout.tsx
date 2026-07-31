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

import { requireOrg } from "@/lib/orgContext";
import { ResponsiveDashboardShell } from "@/components/v3/responsive-shell/responsive-dashboard-shell";

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
  try {
    const ctx = await requireOrg();
    user = {
      name: ctx.user.name || ctx.user.email || "Account",
      role: humanRole(ctx.role),
    };
  } catch {
    // Signed out, or no membership yet. The page decides what happens next.
  }

  return <ResponsiveDashboardShell user={user}>{children}</ResponsiveDashboardShell>;
}
