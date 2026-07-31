// Shared loader for the Team Activity feed — used by the Company → Team
// activity tab and the (legacy, unlinked) company/team page so the query and
// row mapping can't drift between the two.
import { db } from "@/lib/db";
import type { TeamActivityRow, TeamMember } from "@/lib/teamActivityView";

export async function loadTeamActivity(
  organizationId: string,
  { take = 200 }: { take?: number } = {},
): Promise<{ activities: TeamActivityRow[]; members: TeamMember[] }> {
  const [memberships, events] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.activityEvent.findMany({
      where: { organizationId },
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

  return {
    activities: events.map((e) => ({
      id: e.id,
      kind: e.kind,
      summary: e.summary,
      createdAt: e.createdAt.toISOString(),
      actorId: e.actorId,
      actorName: e.actor?.name ?? e.actor?.email ?? null,
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
    })),
  };
}
