-- PRODUCTION BACKFILL, 2026-09-30 — run right after prisma/sql/prod-2026-09-30.sql.
-- Idempotent: an expense that has its organization and date is left alone; a
-- day that exists is left alone (ON CONFLICT DO NOTHING).
-- Same rule as scripts/maintenance/backfill-work-days.ts (the local version).

BEGIN;

-- Every existing expense carries its organization and the day it was spent.
UPDATE "JobExpense" e SET "organizationId" = j."organizationId"
  FROM "Job" j WHERE e."jobId" = j."id" AND e."organizationId" IS NULL;
UPDATE "JobExpense" SET "spentAt" = "createdAt" WHERE "spentAt" IS NULL;

-- The days on site the trail already knows (STARTED rows, one per job and
-- local date). A past date is CLOSED (nobody was asked to close it then);
-- today's stays OPEN.
WITH started AS (
  SELECT a."organizationId",
         (a."meta"::jsonb ->> 'jobId')                    AS "jobId",
         a."actorId",
         a."createdAt",
         to_char((a."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(o."timezone", 'America/New_York'), 'YYYY-MM-DD') AS "date",
         COALESCE(a."meta"::jsonb ->> 'via', 'dashboard') AS via
  FROM "ActivityEvent" a
  JOIN "Organization" o ON o."id" = a."organizationId"
  WHERE a."kind" = 'STARTED' AND a."meta" IS NOT NULL AND a."meta" LIKE '{%'
), days AS (
  SELECT s."organizationId", s."jobId", s."date",
         MIN(s."createdAt") AS first_at,
         MAX(s."createdAt") AS last_at,
         (array_agg(s."actorId" ORDER BY s."createdAt"))[1] AS "actorId",
         (array_agg(s.via       ORDER BY s."createdAt"))[1] AS via
  FROM started s
  JOIN "Job" j ON j."id" = s."jobId" AND j."organizationId" = s."organizationId"
  WHERE s."jobId" IS NOT NULL
  GROUP BY s."organizationId", s."jobId", s."date"
), numbered AS (
  SELECT d.*,
         row_number() OVER (PARTITION BY d."jobId" ORDER BY d."date") AS n,
         to_char((now() AT TIME ZONE 'UTC') AT TIME ZONE COALESCE(o."timezone", 'America/New_York'), 'YYYY-MM-DD') AS today
  FROM days d
  JOIN "Organization" o ON o."id" = d."organizationId"
)
INSERT INTO "WorkDay" ("id", "jobId", "organizationId", "date", "dayNumber", "status", "openedById", "closedById", "closedAt", "note", "source", "createdAt", "updatedAt")
SELECT 'wd_' || md5(n."jobId" || ':' || n."date"),
       n."jobId", n."organizationId", n."date", n.n,
       CASE WHEN n."date" < n.today THEN 'CLOSED' ELSE 'OPEN' END,
       n."actorId",
       CASE WHEN n."date" < n.today THEN n."actorId" END,
       CASE WHEN n."date" < n.today THEN n.last_at END,
       NULL,
       CASE WHEN n.via = 'worker-portal' THEN 'worker' ELSE 'office' END,
       n.first_at, now()
FROM numbered n
ON CONFLICT ("jobId", "date") DO NOTHING;

COMMIT;

-- Counts afterwards:
--   SELECT count(*) FROM "WorkDay";
--   SELECT count(*) FROM "JobExpense" WHERE "organizationId" IS NULL;   -- 0
--   SELECT count(*) FROM "JobExpense" WHERE "spentAt" IS NULL;          -- 0
--   SELECT status, purpose, count(*) FROM "JobExpense" GROUP BY 1, 2;   -- APPROVED / JOB
