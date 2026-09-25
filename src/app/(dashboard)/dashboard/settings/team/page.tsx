import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { TeamClient } from "./team-client";
import { lastActiveLabel } from "@/components/v3/workers-blueprint/workers-data";

export default async function TeamPage() {
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

  // LAST ACTIVE (2026-09-24): the newest ActivityEvent each member wrote —
  // "does what they do reflect on the owner's side?" Best effort; the team
  // sheet never fails on its trail.
  const lastEventByUser = new Map<string, Date>();
  try {
    const rows = await db.activityEvent.groupBy({
      by: ["actorId"],
      where: { organizationId, actorId: { not: null } },
      _max: { createdAt: true },
    });
    for (const r of rows) if (r.actorId && r._max.createdAt) lastEventByUser.set(r.actorId, r._max.createdAt);
  } catch {
    /* no trail, no plate */
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Team"
        description="Invite members, manage roles. Invites expire after 7 days."
      />
      <TeamClient
        members={memberships.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user?.name ?? null,
          email: m.user?.email ?? "",
          role: m.role,
          joinedAt: m.createdAt,
          lastActive: lastActiveLabel(lastEventByUser.get(m.userId) ?? null),
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
    </>
  );
}
