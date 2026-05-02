import { requireUser } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { Badge } from "@/components/ui/Badge";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";
import { SupportTicketRow } from "./support-ticket-row";

export default async function AdminSupportPage() {
  await requireUser();
  const [tickets, openCount, resolvedCount] = await Promise.all([
    db.supportTicket.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { organization: { select: { name: true } } },
    }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.supportTicket.count({ where: { status: "RESOLVED" } }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Support tickets"
        description="Customer issues routed from any org. Move through statuses as you work."
      />
      <StaggerGrid className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total" value={String(tickets.length)} />
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
                status={t.status}
                orgName={t.organization.name}
                createdAt={t.createdAt}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
