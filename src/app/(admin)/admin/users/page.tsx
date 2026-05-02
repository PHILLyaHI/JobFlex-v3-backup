import { requireUser } from "@/lib/orgContext";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { StaggerGrid } from "@/components/ui/StaggerGrid";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { db } from "@/lib/db";
import { relative } from "@/lib/format";

export default async function AdminUsersPage() {
  await requireUser();
  const sinceWeek = new Date();
  sinceWeek.setDate(sinceWeek.getDate() - 7);

  const [users, total, newThisWeek] = await Promise.all([
    db.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        memberships: {
          include: { organization: { select: { name: true } } },
        },
      },
    }),
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: sinceWeek } } }),
  ]);
  const activeSeats = await db.membership.count();

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Users"
        description="Every user across every organization. Role changes happen per-org in that org's Team settings."
      />
      <StaggerGrid className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total users" value={String(total)} />
        <StatCard label="Active seats" value={String(activeSeats)} hint="Memberships count" />
        <StatCard label="New · 7d" value={String(newThisWeek)} />
      </StaggerGrid>
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Recent users</CardTitle>
            <CardSubtitle>Latest 100</CardSubtitle>
          </div>
        </CardHeader>
        <ul className="divide-y divide-[color:var(--ink-line)]">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-3">
              <Avatar name={u.name ?? u.email} size={32} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[color:var(--ink)] truncate">
                  {u.name ?? "—"}
                </div>
                <div className="text-[11px] text-[color:var(--ink-muted)] truncate">
                  {u.email}
                </div>
              </div>
              <div className="hidden md:flex items-center gap-1.5 flex-wrap max-w-[360px] overflow-hidden">
                {u.memberships.slice(0, 3).map((m) => (
                  <Badge key={m.id} tone="neutral">
                    {m.organization.name} · {m.role.toLowerCase()}
                  </Badge>
                ))}
                {u.memberships.length > 3 && (
                  <span className="text-[10px] text-[color:var(--ink-faint)]">
                    +{u.memberships.length - 3}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-[color:var(--ink-muted)] tabular shrink-0">
                {relative(u.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
