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
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { DashboardAnnouncementDismiss } from "./announcement-dismiss";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/auth/login");

  const activeOrgId = session.user.activeOrgId ?? null;

  const [memberships, subscription, announcements, activeOrg] = await Promise.all([
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
    activeOrgId
      ? db.organization.findUnique({
          where: { id: activeOrgId },
          select: {
            name: true,
            logoUrl: true,
            phone: true,
            website: true,
            address: true,
            billingEmail: true,
          },
        })
      : Promise.resolve(null),
  ]);

  // The company is "set up" once its branding profile has been touched (a logo or
  // any contact detail). A fresh org with only an auto-created name shows the
  // "set up your company" nudge in the sidebar instead.
  const companyInfo = {
    name: activeOrg?.name ?? null,
    logoUrl: activeOrg?.logoUrl ?? null,
    setUp: Boolean(
      activeOrg &&
        (activeOrg.logoUrl ||
          activeOrg.phone ||
          activeOrg.website ||
          activeOrg.address ||
          activeOrg.billingEmail),
    ),
  };

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

  // Server-side limited-role route-gate (defense-in-depth behind the middleware).
  // Role comes from the DB above, and the path from the middleware-set header,
  // so this fails CLOSED even if the middleware's JWT decode threw and let a
  // limited role through to a manager route.
  if (routeGate) {
    const pathname = (await headers()).get("x-pathname") ?? "";
    if (pathname && !isPathAllowed(routeGate, pathname)) redirect(routeGate.home as Route);
  }

  return (
    <SessionProvider>
      <div className="flex">
        <Sidebar role={activeRole} company={companyInfo} />
        <main className="flex-1 min-w-0 min-h-dvh">
          <Topbar
            user={{ name: session.user.name, email: session.user.email ?? "" }}
            memberships={membershipItems}
            plan={subscription?.plan ?? "FREE"}
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
        <PlanLimitDialog />
        <div className="md:hidden">
          <MobileTabBar role={activeRole} />
        </div>
      </div>
    </SessionProvider>
  );
}
