// One-time, IDEMPOTENT backfill for WorkerProfile.lastSeenAt.
//
// After the schema step adds `lastSeenAt DateTime?`, existing workers have it
// NULL. The daily inactivity cron already NEVER touches NULL rows, so nothing is
// at risk without this — but leaving them NULL means those workers never become
// subject to the 6-month rule. This sets lastSeenAt = (respondedAt ?? createdAt)
// for every worker whose lastSeenAt is still NULL.
//
// Safe to run repeatedly: it only ever touches rows where lastSeenAt IS NULL, so
// a second run finds nothing to do.
//
// ⚠️ Run MANUALLY, only AFTER the schema is deployed to the target DB. Never
// auto-run against production. See the step report for the exact command.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const workers = await db.workerProfile.findMany({
    where: { lastSeenAt: null },
    select: { id: true, respondedAt: true, createdAt: true },
  });

  let updated = 0;
  for (const w of workers) {
    await db.workerProfile.update({
      where: { id: w.id },
      // respondedAt (when they accepted the invite) is the best "last known
      // active" proxy; fall back to createdAt for workers who never responded.
      data: { lastSeenAt: w.respondedAt ?? w.createdAt },
    });
    updated += 1;
  }

  console.log(
    `[backfill-lastseen] Set lastSeenAt (respondedAt ?? createdAt) on ${updated} worker(s) that had none.`,
  );
}

main()
  .catch((err) => {
    console.error("[backfill-lastseen] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
