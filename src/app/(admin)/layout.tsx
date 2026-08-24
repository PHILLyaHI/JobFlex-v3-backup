// Platform admin console — route-group layout.
//
// GUARD. requirePlatformAdmin() tries the signed `jf_admin` cookie first (the
// username/password login at /admin/login), then a NextAuth session whose user
// carries isPlatformAdmin. Either failing sends the visitor to /admin/login —
// not /auth/login, because the console has its own door now.
//
// THE LOGIN PAGE LIVES UNDER THIS LAYOUT (src/app/(admin)/admin/login), so it
// must not be guarded — a guard there would redirect the login page to itself.
// The middleware sets `x-pathname` on every /admin request; for the login path
// this layout renders its children bare, no shell, no guard.
//
// SHELL. The blueprint admin chrome (components/v3/admin-shell) replaces the
// classic Tailwind header + rail. The three nav badges — unread support
// tickets, pending payout requests, leads in the manual queue — are the same
// queries the old rail received as props, handed to the sidebar through the
// shared NavRoleProvider's `badges` channel keyed by nav href.

import { redirect } from "next/navigation";
import type { Route } from "next";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { readAdminCookie } from "@/lib/adminAuth";
import { requirePlatformAdmin } from "@/lib/orgContext";
import { unreadSupportCount } from "@/actions/support";
import { NavRoleProvider } from "@/components/v3/blueprint-shell/nav-role";
import { AdminShell } from "@/components/v3/admin-shell/admin-shell";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
    return <>{children}</>;
  }

  let admin: Awaited<ReturnType<typeof requirePlatformAdmin>> | null = null;
  try {
    admin = await requirePlatformAdmin();
  } catch {
    admin = null;
  }
  // redirect() throws, so it sits outside the try above.
  if (!admin) redirect("/admin/login" as Route);

  // Which door the admin came through decides what Sign out clears.
  const viaCookie = (await readAdminCookie()) !== null;

  const [unreadSupport, pendingPayouts, manualQueueLeads] = await Promise.all([
    unreadSupportCount(),
    db.payoutRequest.count({ where: { status: "PENDING" } }),
    db.platformLead.count({ where: { status: "MANUAL_QUEUE" } }),
  ]);

  const badges: Record<string, number> = {
    "/admin/support": unreadSupport,
    "/admin/payouts": pendingPayouts,
    "/admin/lead-center": manualQueueLeads,
  };

  const adminName = admin.name || admin.email;

  return (
    <NavRoleProvider identity={{ role: null, name: adminName }} badges={badges}>
      <AdminShell adminName={adminName} signOutMode={viaCookie ? "cookie" : "nextauth"}>
        {children}
      </AdminShell>
    </NavRoleProvider>
  );
}
