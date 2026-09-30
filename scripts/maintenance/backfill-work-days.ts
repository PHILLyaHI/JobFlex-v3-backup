// STAGE A BACKFILL (2026-09-30): the days on site that the trail already
// knows become WorkDay rows, and every expense carries its organization and
// the day it was spent.
//
//   npx tsx --tsconfig tsconfig.json scripts/maintenance/backfill-work-days.ts [--dry]
//
// Idempotent: a day that exists is left alone; an expense that has its
// columns is left alone. Safe on any database the schema is pushed to.
// A backfilled day of a past date is CLOSED (nobody was asked to close it
// then); today's stays OPEN. Postgres: see the SQL in the stage-A report for
// the same fill without Node.

import { PrismaClient } from "@prisma/client";
import { localDayKey } from "../../src/lib/jobProgressShared";

const db = new PrismaClient();
const dry = process.argv.includes("--dry");

async function main() {
  const orgs = await db.organization.findMany({ select: { id: true, timezone: true } });
  const today = (tz: string) => localDayKey(new Date(), tz);
  let days = 0;
  for (const org of orgs) {
    const tz = org.timezone || "America/New_York";
    const rows = await db.activityEvent.findMany({
      where: { organizationId: org.id, kind: "STARTED" },
      select: { actorId: true, createdAt: true, meta: true },
      orderBy: { createdAt: "asc" },
    });
    const byJob = new Map<string, Map<string, { first: Date; last: Date; actorId: string | null; via: string }>>();
    for (const r of rows) {
      let meta: { jobId?: string; via?: string } = {};
      try { meta = JSON.parse(r.meta ?? "{}"); } catch { /* skip */ }
      if (!meta.jobId) continue;
      const key = localDayKey(r.createdAt, tz);
      const m = byJob.get(meta.jobId) ?? new Map();
      const cur = m.get(key);
      if (!cur) m.set(key, { first: r.createdAt, last: r.createdAt, actorId: r.actorId, via: meta.via ?? "dashboard" });
      else cur.last = r.createdAt;
      byJob.set(meta.jobId, m);
    }
    for (const [jobId, byDate] of byJob) {
      const job = await db.job.findFirst({ where: { id: jobId, organizationId: org.id }, select: { id: true } });
      if (!job) continue;
      const dates = [...byDate.keys()].sort();
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const exists = await db.workDay.findUnique({ where: { jobId_date: { jobId, date } }, select: { id: true } });
        if (exists) continue;
        const d = byDate.get(date)!;
        const past = date < today(tz);
        days++;
        if (dry) continue;
        await db.workDay.create({
          data: {
            organizationId: org.id,
            jobId,
            date,
            dayNumber: i + 1,
            status: past ? "CLOSED" : "OPEN",
            openedById: d.actorId,
            closedById: past ? d.actorId : null,
            closedAt: past ? d.last : null,
            source: d.via === "worker-portal" ? "worker" : "office",
            createdAt: d.first,
          },
        });
      }
    }
  }
  // Expenses: the organization from the job, the spend date from the row's own date.
  const expenses = await db.jobExpense.findMany({ where: { OR: [{ organizationId: null }, { spentAt: null }] }, select: { id: true, createdAt: true, organizationId: true, spentAt: true, job: { select: { organizationId: true } } } });
  let fixed = 0;
  for (const e of expenses) {
    fixed++;
    if (dry) continue;
    await db.jobExpense.update({ where: { id: e.id }, data: { organizationId: e.organizationId ?? e.job.organizationId, spentAt: e.spentAt ?? e.createdAt } });
  }
  console.log(`${dry ? "would create" : "created"} ${days} work day(s); ${dry ? "would fill" : "filled"} ${fixed} expense row(s)`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
