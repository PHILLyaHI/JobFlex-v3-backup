import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { TeamClient } from "../../settings/team/team-client";
import { TeamActivity, type TeamActivityRow } from "@/components/company/TeamActivity";

export default async function CompanyTeamPage() {
  const { organizationId } = await requireOrg();

  const [memberships, invites, events] = await Promise.all([
    db.membership.findMany({
      where: { organizationId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    db.invite.findMany({
      where: { organizationId, acceptedAt: null },
      include: { invitedBy: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.activityEvent.findMany({
      where: { organizationId },
      include: {
        actor: { select: { id: true, name: true, email: true } },
        proposal: { select: { title: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  const activities: TeamActivityRow[] = events.map((e) => ({
    id: e.id,
    kind: e.kind,
    summary: e.summary,
    createdAt: e.createdAt.toISOString(),
    actorId: e.actorId,
    actorName: e.actor?.name ?? e.actor?.email ?? null,
    proposalTitle: e.proposal?.title ?? null,
    clientName: e.client?.name ?? null,
  }));

  return (
    <>
      <TeamClient
        members={memberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user?.name ?? null,
          email: m.user?.email ?? "",
          role: m.role,
          joinedAt: m.createdAt,
        }))}
        invites={invites.map((i) => ({
          id: i.id,
          email: i.email,
          role: i.role,
          token: i.token,
          invitedByName: i.invitedBy?.name ?? i.invitedBy?.email ?? null,
          expiresAt: i.expiresAt,
          createdAt: i.createdAt,
        }))}
      />
      <TeamActivity
        activities={activities}
        members={memberships.map((m) => ({
          id: m.userId,
          name: m.user?.name ?? m.user?.email ?? "Member",
        }))}
      />
    </>
  );
}
