-- STAGE A (2026-09-30): crew days, media columns, worker expenses — Postgres (Neon).
-- What `prisma db push` does on the local SQLite, written out for production,
-- plus the backfill. Additions only; nothing is dropped or renamed. Run once,
-- in one transaction, BEFORE the code that reads these columns is deployed.
--
-- Prisma names: tables and columns are quoted camelCase, exactly as below.

BEGIN;

-- ── WorkDay: one row per job and local date ────────────────────────────────
CREATE TABLE IF NOT EXISTS "WorkDay" (
  "id"             TEXT NOT NULL,
  "jobId"          TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "date"           TEXT NOT NULL,                -- "2026-09-30" in the organization's timezone
  "dayNumber"      INTEGER NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'OPEN', -- OPEN | CLOSED | PENDING
  "openedById"     TEXT,
  "closedById"     TEXT,
  "closedAt"       TIMESTAMP(3),
  "note"           TEXT,
  "source"         TEXT NOT NULL DEFAULT 'worker', -- worker | office
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WorkDay_jobId_date_key" ON "WorkDay" ("jobId", "date");
CREATE INDEX IF NOT EXISTS "WorkDay_organizationId_status_idx" ON "WorkDay" ("organizationId", "status");
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── JobPhoto: who, which day, what ─────────────────────────────────────────
ALTER TABLE "JobPhoto"
  ADD COLUMN IF NOT EXISTS "uploadedById" TEXT,
  ADD COLUMN IF NOT EXISTS "workDayId"    TEXT,
  ADD COLUMN IF NOT EXISTS "media"        TEXT,      -- photo | video (null: read the analysis JSON as before)
  ADD COLUMN IF NOT EXISTS "contentType"  TEXT,
  ADD COLUMN IF NOT EXISTS "bytes"        INTEGER,
  ADD COLUMN IF NOT EXISTS "editedAt"     TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "JobPhoto_workDayId_idx" ON "JobPhoto" ("workDayId");
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_workDayId_fkey"
  FOREIGN KEY ("workDayId") REFERENCES "WorkDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── JobExpense: the statuses ───────────────────────────────────────────────
ALTER TABLE "JobExpense"
  ADD COLUMN IF NOT EXISTS "organizationId" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedById"  TEXT,
  ADD COLUMN IF NOT EXISTS "paidBy"         TEXT NOT NULL DEFAULT 'COMPANY',  -- WORKER | COMPANY
  ADD COLUMN IF NOT EXISTS "status"         TEXT NOT NULL DEFAULT 'APPROVED', -- SUBMITTED | APPROVED | REJECTED | REIMBURSED
  ADD COLUMN IF NOT EXISTS "rejectReason"   TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedById"   TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reimbursedAt"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "vendor"         TEXT,
  ADD COLUMN IF NOT EXISTS "spentAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "editedAt"       TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "JobExpense_organizationId_status_idx" ON "JobExpense" ("organizationId", "status");

-- ── Backfill: every existing expense is APPROVED / COMPANY (the column
--    defaults did that), carries its organization, and is dated as before ──
UPDATE "JobExpense" e SET "organizationId" = j."organizationId"
  FROM "Job" j WHERE e."jobId" = j."id" AND e."organizationId" IS NULL;
UPDATE "JobExpense" SET "spentAt" = "createdAt" WHERE "spentAt" IS NULL;

-- ── Backfill: the days on site the trail already knows (STARTED rows, one
--    per job and local date). A past date is CLOSED (nobody was asked to
--    close it then); today's stays OPEN. Rows that already exist are kept.
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

-- Check afterwards:
--   SELECT count(*) FROM "WorkDay";
--   SELECT status, count(*) FROM "JobExpense" GROUP BY status;   -- all APPROVED
--   SELECT count(*) FROM "JobExpense" WHERE "organizationId" IS NULL;  -- 0
