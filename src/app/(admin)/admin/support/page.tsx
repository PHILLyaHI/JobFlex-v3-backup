import { requirePlatformAdmin } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { db } from "@/lib/db";
import { SupportTicketRow } from "./support-ticket-row";
import { MarkSupportSeen } from "./mark-seen";

export const dynamic = "force-dynamic";

export default async function AdminSupportPage() {
  await requirePlatformAdmin();
  const [tickets, openCount, resolvedCount, unreadCount] = await Promise.all([
    db.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        organization: { select: { name: true } },
        user: { select: { email: true } },
      },
    }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.supportTicket.count({ where: { status: "RESOLVED" } }),
    db.supportTicket.count({ where: { adminReadAt: null } }),
  ]);

  return (
    <>
      {/* Opening the inbox is "seeing" the queue — clears the unread badge. */}
      <MarkSupportSeen hasUnread={unreadCount > 0} />

      <PageHeader
        eyebrow="Platform"
        title="Support tickets"
        description="Customer issues routed from any org. Move through statuses as you work."
      />
      <StaggerGrid className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total" value={String(tickets.length)} />
        <StatCard label="New" value={String(unreadCount)} />
        <StatCard label="Open" value={String(openCount)} />
        <StatCard label="Resolved" value={String(resolvedCount)} />
      </StaggerGrid>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Inbox</CardTitle>
            <CardSubtitle>Latest 100 tickets</CardSubtitle>
          </div>
        </CardHeader>
        {tickets.length === 0 ? (
          <p className="text-[12px] text-[color:var(--ink-muted)]">No support tickets yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--ink-line)]">
            {tickets.map((t) => (
              <SupportTicketRow
                key={t.id}
                id={t.id}
                subject={t.subject}
                body={t.body}
                category={t.category}
                priority={t.priority}
                status={t.status}
                orgName={t.organization.name}
                submitterEmail={t.user?.email ?? null}
                createdAt={t.createdAt}
                unread={t.adminReadAt === null}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
