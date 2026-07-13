import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminLayout } from "@/components/admin/AdminRail";
import { AdminNotificationBell } from "@/components/admin/AdminNotificationBell";
import { recentSupportTickets, unreadSupportCount } from "@/actions/support";

export default async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/login?next=/admin");

  // Gate: dedicated platform-admin flag (not org-level OWNER/ADMIN). Only
  // explicitly-flagged users see platform-wide subscribers/revenue/payouts.
  const admin = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformAdmin: true },
  });
  if (!admin?.isPlatformAdmin) redirect("/dashboard" as never);

  // Support notification feed for the header bell + nav badges (platform-wide).
  const [feed, unreadSupport, pendingPayouts, manualQueueLeads] = await Promise.all([
    recentSupportTickets(8),
    unreadSupportCount(),
    db.payoutRequest.count({ where: { status: "PENDING" } }),
    db.platformLead.count({ where: { status: "MANUAL_QUEUE" } }),
  ]);

  return (
    <div>
      <header
        className="border-b border-[color:var(--ink-line)] backdrop-blur sticky top-0 z-20"
        style={{ backgroundColor: "color-mix(in srgb, var(--paper) 85%, transparent)" }}
      >
        <div className="max-w-[1400px] mx-auto h-14 px-6 lg:px-10 flex items-center justify-between">
          <Link href="/admin" className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-[6px] bg-[color:var(--ink)] text-[color:var(--paper)] grid place-items-center font-display text-[13px] leading-none">
              J
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-[15px] tracking-[-0.015em]">JobFlex</span>
              <span className="quiet-caps">Admin</span>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <AdminNotificationBell items={feed} unread={unreadSupport} />
            <Link
              href={"/dashboard" as never}
              className="text-[12px] text-[color:var(--ink-muted)] hover:text-[color:var(--ink)]"
            >
              ← Back to dashboard
            </Link>
          </div>
        </div>
      </header>
      <AdminLayout
        unreadSupport={unreadSupport}
        pendingPayouts={pendingPayouts}
        manualQueueLeads={manualQueueLeads}
      >
        {children}
      </AdminLayout>
    </div>
  );
}
