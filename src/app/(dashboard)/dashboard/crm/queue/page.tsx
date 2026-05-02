import { requireOrg } from "@/lib/orgContext";
import { db } from "@/lib/db";
import { FollowUpQueue, type QueueRow } from "@/components/crm/FollowUpQueue";

export default async function QueuePage() {
  const { organizationId } = await requireOrg();
  const now = new Date();

  const followUps = await db.followUp.findMany({
    where: { organizationId, completedAt: null },
    orderBy: { runAt: "asc" },
    take: 100,
  });

  const proposalIds = Array.from(
    new Set(followUps.map((f) => f.proposalId).filter(Boolean) as string[]),
  );
  const proposals = proposalIds.length
    ? await db.proposal.findMany({
        where: { id: { in: proposalIds } },
        select: {
          id: true,
          title: true,
          client: { select: { name: true } },
        },
      })
    : [];
  const proposalById = new Map(proposals.map((p) => [p.id, p]));

  const rows: QueueRow[] = followUps.map((f) => {
    const p = f.proposalId ? proposalById.get(f.proposalId) : null;
    return {
      id: f.id,
      proposalId: f.proposalId,
      proposalTitle: p?.title ?? null,
      clientName: p?.client?.name ?? null,
      runAt: f.runAt,
      note: f.note,
      isOverdue: f.runAt <= now,
    };
  });

  return <FollowUpQueue rows={rows} />;
}
