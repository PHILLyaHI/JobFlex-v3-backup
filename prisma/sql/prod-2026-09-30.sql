-- PRODUCTION SCHEMA, 2026-09-30 — Postgres (Neon). One file, stage A then stage D.
-- Apply BEFORE the code is deployed. Additions only, and re-runnable: every
-- statement is IF NOT EXISTS or guarded, so a second run changes nothing.
-- The one statement that is not an addition relaxes a constraint (stage D:
-- JobExpense."jobId" may be NULL for a purchase for stock); nothing is dropped
-- or renamed, no data is touched. The backfill is a separate file:
-- prisma/sql/prod-2026-09-30-backfill.sql (run it right after this one).
--
-- origin/main brought no schema change (admin traffic: live map, ad links).
-- Prisma names: tables and columns are quoted camelCase, exactly as below.

BEGIN;

-- ════════════════════ STAGE A — crew days, media columns, expense statuses ══

-- WorkDay: one row per job and local date
CREATE TABLE IF NOT EXISTS "WorkDay" (
  "id"             TEXT NOT NULL,
  "jobId"          TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "date"           TEXT NOT NULL,                  -- "2026-09-30" in the organization's timezone
  "dayNumber"      INTEGER NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'OPEN',   -- OPEN | CLOSED | PENDING
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkDay_jobId_fkey') THEN
    ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_jobId_fkey"
      FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WorkDay_organizationId_fkey') THEN
    ALTER TABLE "WorkDay" ADD CONSTRAINT "WorkDay_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- JobPhoto: who, which day, what
ALTER TABLE "JobPhoto"
  ADD COLUMN IF NOT EXISTS "uploadedById" TEXT,
  ADD COLUMN IF NOT EXISTS "workDayId"    TEXT,
  ADD COLUMN IF NOT EXISTS "media"        TEXT,      -- photo | video
  ADD COLUMN IF NOT EXISTS "contentType"  TEXT,
  ADD COLUMN IF NOT EXISTS "bytes"        INTEGER,
  ADD COLUMN IF NOT EXISTS "editedAt"     TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "JobPhoto_workDayId_idx" ON "JobPhoto" ("workDayId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobPhoto_workDayId_fkey') THEN
    ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_workDayId_fkey"
      FOREIGN KEY ("workDayId") REFERENCES "WorkDay" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- JobExpense: the statuses (existing rows read APPROVED / COMPANY by default)
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

-- ════════════════════ STAGE D — job or stock ═══════════════════════════════

-- A purchase FOR STOCK has no job (relaxes NOT NULL; re-running is a no-op).
ALTER TABLE "JobExpense" ALTER COLUMN "jobId" DROP NOT NULL;
ALTER TABLE "JobExpense"
  ADD COLUMN IF NOT EXISTS "purpose"     TEXT NOT NULL DEFAULT 'JOB',  -- JOB | STOCK
  ADD COLUMN IF NOT EXISTS "stockItemId" TEXT,
  ADD COLUMN IF NOT EXISTS "stockQty"    DOUBLE PRECISION;

-- The price stock moved at, stamped on issue and return.
ALTER TABLE "InventoryMovement"
  ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION;

COMMIT;
