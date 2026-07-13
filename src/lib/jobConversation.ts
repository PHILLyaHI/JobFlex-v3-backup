import { db } from "@/lib/db";

/**
 * Create (or reuse) the JOB-kind group chat for a job and ensure the given users
 * are participants. Called when a job is created with a crew, or when a worker is
 * assigned later. Best-effort — it never throws, so messaging can't block the
 * scheduling/assignment flow. Conversation.jobId is @unique, so the upsert keeps
 * exactly one chat per job.
 *
 * Quota: intentionally NOT gated. This is an automatic side effect of job
 * scheduling, and JOB-kind threads are excluded from the conversationsStarted
 * counter (see limitsEngine countUsage).
 */
export async function ensureJobConversation(input: {
  jobId: string;
  organizationId: string;
  title: string;
  userIds: string[];
}): Promise<string | null> {
  try {
    const conv = await db.conversation.upsert({
      where: { jobId: input.jobId },
      update: {},
      create: {
        organizationId: input.organizationId,
        jobId: input.jobId,
        kind: "JOB",
        title: `Job · ${input.title}`.slice(0, 140),
      },
    });
    const userIds = Array.from(new Set(input.userIds.filter(Boolean)));
    if (userIds.length > 0) {
      // Add only members not already in the chat (SQLite createMany has no
      // skipDuplicates, and a duplicate would trip the @@unique constraint).
      const existing = await db.conversationParticipant.findMany({
        where: { conversationId: conv.id, userId: { in: userIds } },
        select: { userId: true },
      });
      const have = new Set(existing.map((p) => p.userId));
      const toAdd = userIds.filter((id) => !have.has(id));
      if (toAdd.length > 0) {
        await db.conversationParticipant.createMany({
          data: toAdd.map((userId) => ({ conversationId: conv.id, userId })),
        });
      }
    }
    return conv.id;
  } catch (err) {
    console.warn("[ensureJobConversation] failed:", err);
    return null;
  }
}
