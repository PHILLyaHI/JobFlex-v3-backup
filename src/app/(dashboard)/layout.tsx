import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandK } from "@/components/layout/CommandK";
import { SessionProvider } from "@/components/providers/SessionProvider";
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

  return (
    <SessionProvider>
      <div className="flex">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-dvh">
          <Topbar
            user={{ name: session.user.name, email: session.user.email ?? "" }}
            memberships={membershipItems}
            plan={subscription?.plan ?? "FREE"}
          />
          <div className="px-6 lg:px-10 py-8 max-w-[1400px] mx-auto">
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
        <CommandK />
      </div>
    </SessionProvider>
  );
}
