import { redirect } from "next/navigation";
import type { Route } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_ROUTE_GATES, isPathAllowed } from "@/lib/roleRoutes";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandK } from "@/components/layout/CommandK";
import { PlanLimitDialog } from "@/components/billing/PlanLimitDialog";
import { LeadOfferPopup } from "@/components/leads/LeadOfferPopup";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { SupportWidget } from "@/components/v3/support-widget/support-widget";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { getBadgeCounts } from "@/lib/badgeCounts";
import { getNavLimitCounters } from "@/lib/navLimits";
import { DashboardAnnouncementDismiss } from "./announcement-dismiss";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const activeOrgId = session.user.activeOrgId ?? null;

  const [memberships, subscription, announcements] = await Promise.all([
    db.membership.findMany({
      where: { userId: session.user.id },
      include: { organization: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    activeOrgId
      ? db.subscription.findUnique({
          where: { organizationId: activeOrgId },
          select: { plan: true },
        })
      : Promise.resolve(null),
    activeOrgId
      ? db.announcement.findMany({
          where: {
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
              {
                OR: [
                  { organizationId: activeOrgId, scope: "ORG" },
                  { scope: "PLATFORM" },
                ],
              },
            ],
          },
          orderBy: [{ scope: "desc" }, { priority: "desc" }, { createdAt: "desc" }],
          take: 6,
        })
      : db.announcement.findMany({
          where: {
            scope: "PLATFORM",
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          orderBy: { createdAt: "desc" },
          take: 6,
        }),
  ]);

  const membershipItems = memberships.map((m) => ({
    organizationId: m.organizationId,
    organizationName: m.organization.name,
    role: m.role,
    current: m.organizationId === activeOrgId,
  }));

  // Active-org role drives the limited-role experiences (INSTALLER / SALES /
  // ESTIMATOR): a restricted nav and no org-wide manager tools (global search,
  // notifications). Office roles get the full dashboard.
  const activeRole =
    membershipItems.find((m) => m.current)?.role ?? membershipItems[0]?.role ?? null;
  const isWorker = activeRole === "INSTALLER";
  const routeGate = activeRole ? ROLE_ROUTE_GATES[activeRole] : undefined;
  const isLimited = Boolean(routeGate);
  // Lead-offer pop-up is only for people who can act on a lead (matches the
  // requireSalesOrManager gate on accept/decline): sales + manager roles, never
  // installers or estimators.
  const canHandleLeads = Boolean(activeOrgId) && !isWorker && activeRole !== "ESTIMATOR";

  // Server-side limited-role route-gate (defense-in-depth behind the middleware).
  // Role comes from the DB above, and the path from the middleware-set header,
  // so this fails CLOSED even if the middleware's JWT decode threw and let a
  // limited role through to a manager route.
  if (routeGate) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname && !isPathAllowed(routeGate, pathname)) redirect(routeGate.home as Route);
  }

  // Workers see a read-only slice — no create surfaces, so no quota counters.
  const [badgeCounts, navLimits] = activeOrgId
    ? await Promise.all([
        getBadgeCounts(activeOrgId, session.user.id, activeRole),
        isWorker ? Promise.resolve({}) : getNavLimitCounters(activeOrgId),
      ])
    : [{}, {}];

  return (
    <SessionProvider>
      <div className="flex">
        <Sidebar
          role={activeRole}
          badges={badgeCounts}
          limits={navLimits}
          plan={subscription?.plan}
        />
        <main className="flex-1 min-w-0 min-h-dvh">
          <Topbar
            user={{ name: session.user.name, email: session.user.email ?? "" }}
            memberships={membershipItems}
            plan={subscription?.plan}
            isWorker={isWorker}
            limited={isLimited}
          />
          <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto pb-24 md:pb-8">
            <DashboardAnnouncementDismiss
              announcements={announcements.map((a) => ({
                id: a.id,
                title: a.title,
                body: a.body,
                priority: a.priority,
                createdAt: a.createdAt,
                expiresAt: a.expiresAt,
              }))}
            />
            {children}
          </div>
        </main>
        {!isLimited && <CommandK />}
        {canHandleLeads && <LeadOfferPopup />}
        <PlanLimitDialog />
        {/* The support composer. It was mounted in the two blueprint shells
            only, so ~50 routes had no Help control at all — every billing and
            settings surface among them, which is where the composer's Billing
            and Account categories point. Its launchers: the floating plate
            above 860px, the topbar button between 768 and 860, and the tab
            bar's More drawer below 768, where this group's bottom-right corner
            already belongs to the create button and the tab bar. */}
        <SupportWidget signedIn />
        <div className="md:hidden">
          <MobileTabBar role={activeRole} badges={badgeCounts} />
        </div>
      </div>
    </SessionProvider>
  );
}
