// Shared loader for the Team Activity feed — used by the Company → Team
// activity tab and the (legacy, unlinked) company/team page so the query and
// row mapping can't drift between the two.
import { db } from "@/lib/db";
import type { TeamActivityRow, TeamMember } from "@/lib/teamActivityView";

export async function loadTeamActivity(
  organizationId: string,
  { take = 200, since }: { take?: number; since?: Date | null } = {},
): Promise<{ activities: TeamActivityRow[]; members: TeamMember[] }> {
  const [memberships, events] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.activityEvent.findMany({
      where: { organizationId, ...(since ? { createdAt: { gte: since } } : {}) },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        proposal: { select: { title: true } },
        client: { select: { name: true } },
        lead: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  const roleByUser = new Map(memberships.map((m) => [m.userId, m.role]));
  return {
    activities: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      summary: e.summary,
      createdAt: e.createdAt.toISOString(),
      actorId: e.actorId,
      actorName: e.actor?.name ?? e.actor?.email ?? null,
      actorRole: e.actorId ? (roleByUser.get(e.actorId) ?? null) : null,
      meta: e.meta,
      proposalId: e.proposalId,
      proposalTitle: e.proposal?.title ?? null,
      clientId: e.clientId,
      clientName: e.client?.name ?? null,
      leadId: e.leadId,
      leadName: e.lead?.name ?? null,
    })),
    members: memberships.map((m) => ({
      id: m.userId,
      name: m.user?.name ?? m.user?.email ?? "Member",
      role: m.role,
    })),
  };
}
