// One-time backfill: move legacy per-job JobMessage rows into the unified
// Conversation/Message system (Conversation.jobId). Idempotent — a job that
// already has a conversation is skipped, so this is safe to re-run.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const jobs = await db.job.findMany({
    where: { messages: { some: {} } },
    select: {
      id: true,
      organizationId: true,
      title: true,
      conversation: { select: { id: true } },
    },
  });

  let conversationsCreated = 0;
  let messagesCopied = 0;

  for (const job of jobs) {
    if (job.conversation) continue; // already migrated

    const legacy = await db.jobMessage.findMany({
      where: { jobId: job.id },
      orderBy: { createdAt: "asc" },
    });
    if (legacy.length === 0) continue;

    const conv = await db.conversation.create({
      data: { organizationId: job.organizationId, jobId: job.id, title: job.title },
    });
    conversationsCreated++;

    for (const m of legacy) {
      await db.message.create({
        data: {
          conversationId: conv.id,
          authorId: m.authorId,
          body: m.body,
          createdAt: m.createdAt,
        },
      });
      messagesCopied++;
    }
  }

  console.log(
    `Backfill complete: ${conversationsCreated} job conversation(s) created, ${messagesCopied} message(s) copied.`,
  );
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
