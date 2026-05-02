import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { TeamClient } from "../../settings/team/team-client";

export default async function CompanyTeamPage() {
  const { organizationId } = await requireOrg();

  const [memberships, invites] = await Promise.all([
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
  ]);

  return (
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
  );
}
